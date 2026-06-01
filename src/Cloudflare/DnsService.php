<?php

namespace Com\Prestonhager\Dns\Cloudflare;

use Com\Prestonhager\Dns\Support\Config;
use Com\Prestonhager\Dns\Support\RecordName;
use Com\Prestonhager\Dns\Support\ServerDnsState;
use Com\Prestonhager\Dns\Support\SrvProfile;
use Pterodactyl\Plugins\Dto\ServerSummary;
use Pterodactyl\Plugins\Exceptions\PluginException;
use Pterodactyl\Plugins\PluginContext;

class DnsService
{
    public function __construct(
        private readonly PluginContext $context,
        private readonly Config $config,
        private readonly Client $client,
        private readonly ServerDnsState $state,
    ) {
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function listRecordsForServer(int $serverId): array
    {
        return $this->state->dnsRecords($serverId);
    }

    /**
     * @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    public function createRecord(int $serverId, ServerSummary $server, array $input): array
    {
        $type = strtoupper((string) ($input['type'] ?? ''));
        $payload = $this->buildPayload($type, $input, $server);
        $result = $this->client->createRecord($payload);
        $record = $this->mapCloudflareResult($result['result'] ?? [], $input);

        $this->state->upsertRecord($serverId, $record);
        $this->context->activity()->log('dns-record-created', [
            'server_id' => $serverId,
            'type' => $type,
            'cloudflare_id' => $record['cloudflare_id'],
        ]);

        return $record;
    }

    /**
     * @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    public function updateRecord(int $serverId, ServerSummary $server, string $cloudflareId, array $input): array
    {
        $existing = $this->state->findRecord($serverId, $cloudflareId);
        if (is_null($existing)) {
            throw new PluginException('DNS record not found for this server.');
        }

        $type = strtoupper((string) ($input['type'] ?? $existing['type'] ?? ''));
        $payload = $this->buildPayload($type, array_merge($existing, $input), $server, partial: true);
        $result = $this->client->updateRecord($cloudflareId, $payload);
        $record = $this->mapCloudflareResult($result['result'] ?? [], array_merge($existing, $input));

        $this->state->upsertRecord($serverId, $record);
        $this->context->activity()->log('dns-record-updated', [
            'server_id' => $serverId,
            'cloudflare_id' => $cloudflareId,
        ]);

        return $record;
    }

    public function deleteRecord(int $serverId, string $cloudflareId): void
    {
        $existing = $this->state->findRecord($serverId, $cloudflareId);
        if (is_null($existing)) {
            throw new PluginException('DNS record not found for this server.');
        }

        $this->client->deleteRecord($cloudflareId);

        if ($this->state->aRecordId($serverId) === $cloudflareId) {
            $state = $this->state->all($serverId);
            $state['a_record_id'] = null;
            $state['a_record_name'] = null;
            $this->state->save($serverId, $state);
        }

        $this->state->removeRecord($serverId, $cloudflareId);
        $this->context->activity()->log('dns-record-deleted', [
            'server_id' => $serverId,
            'cloudflare_id' => $cloudflareId,
        ]);
    }

    public function deleteAllForServer(int $serverId): void
    {
        foreach ($this->state->dnsRecords($serverId) as $record) {
            $id = $record['cloudflare_id'] ?? null;
            if (is_string($id) && $id !== '') {
                try {
                    $this->client->deleteRecord($id);
                } catch (PluginException) {
                    // Best-effort cleanup when record already removed in Cloudflare.
                }
            }
        }

        $aRecordId = $this->state->aRecordId($serverId);
        if (!is_null($aRecordId)) {
            try {
                $this->client->deleteRecord($aRecordId);
            } catch (PluginException) {
            }
        }

        $this->state->clear($serverId);
    }

    /**
     * @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    private function buildPayload(string $type, array $input, ServerSummary $server, bool $partial = false): array
    {
        $ttl = isset($input['ttl']) ? (int) $input['ttl'] : $this->config->defaultTtl();
        $baseDomain = $this->config->baseDomain();
        $name = RecordName::normalizeName((string) ($input['name'] ?? RecordName::fqdn(RecordName::labelFromServer($server), $baseDomain)), $baseDomain);

        $payload = [
            'ttl' => $ttl,
            'proxied' => filter_var($input['proxied'] ?? false, FILTER_VALIDATE_BOOLEAN),
        ];

        if (!$partial) {
            $payload['type'] = $type;
            $payload['name'] = $name;
        }

        return match ($type) {
            'A' => array_merge($payload, ['content' => (string) ($input['content'] ?? $input['ip'] ?? '')]),
            'AAAA' => array_merge($payload, ['content' => (string) ($input['content'] ?? '')]),
            'CNAME' => array_merge($payload, ['content' => (string) ($input['content'] ?? $input['target'] ?? '')]),
            'TXT' => array_merge($payload, ['content' => (string) ($input['content'] ?? '')]),
            'MX' => array_merge($payload, [
                'content' => (string) ($input['content'] ?? $input['target'] ?? ''),
                'priority' => (int) ($input['priority'] ?? 10),
            ]),
            'SRV' => $this->buildSrvPayload($payload, $input, $name, $baseDomain),
            default => throw new PluginException(sprintf('Unsupported DNS record type "%s".', $type)),
        };
    }

    /**
     * @param array<string, mixed> $payload
     * @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    private function buildSrvPayload(array $payload, array $input, string $name, string $baseDomain): array
    {
        $data = is_array($input['data'] ?? null) ? $input['data'] : $input;

        $service = (string) ($data['service'] ?? '_minecraft');
        $proto = (string) ($data['proto'] ?? '_tcp');
        $port = (int) ($data['port'] ?? 0);
        $target = (string) ($data['target'] ?? '');

        if (!str_starts_with($service, '_')) {
            $service = '_' . $service;
        }
        if (!str_starts_with($proto, '_')) {
            $proto = '_' . $proto;
        }

        if ($port <= 0) {
            throw new PluginException('SRV records require a valid port.');
        }

        if ($target === '') {
            throw new PluginException('SRV records require a target hostname.');
        }

        $relative = RecordName::srvRelativeName(
            new SrvProfile('custom', 'custom', $service, $proto),
            $this->relativeLabel($name, $baseDomain)
        );

        return array_merge($payload, [
            'type' => 'SRV',
            'name' => RecordName::normalizeName($relative . '.' . $baseDomain, $baseDomain),
            'data' => [
                'service' => $service,
                'proto' => $proto,
                'name' => $this->relativeLabel($name, $baseDomain),
                'priority' => (int) ($data['priority'] ?? 0),
                'weight' => (int) ($data['weight'] ?? 5),
                'port' => $port,
                'target' => rtrim($target, '.'),
            ],
        ]);
    }

    /**
     * @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    private function mapCloudflareResult(array $result, array $input): array
    {
        return [
            'cloudflare_id' => (string) ($result['id'] ?? ''),
            'type' => (string) ($result['type'] ?? $input['type'] ?? ''),
            'name' => (string) ($result['name'] ?? $input['name'] ?? ''),
            'content' => $result['content'] ?? null,
            'data' => $result['data'] ?? ($input['data'] ?? null),
            'ttl' => $result['ttl'] ?? $this->config->defaultTtl(),
            'proxied' => $result['proxied'] ?? false,
            'profile_id' => $input['profile_id'] ?? null,
            'created_at' => $input['created_at'] ?? now()->toIso8601String(),
            'updated_at' => now()->toIso8601String(),
        ];
    }

    private function relativeLabel(string $fqdn, string $baseDomain): string
    {
        $suffix = '.' . $baseDomain;
        if (str_ends_with(strtolower($fqdn), strtolower($suffix))) {
            return substr($fqdn, 0, -strlen($suffix));
        }

        return $fqdn;
    }
}
