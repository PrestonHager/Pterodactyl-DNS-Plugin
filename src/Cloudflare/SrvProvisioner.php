<?php

namespace Com\Prestonhager\Dns\Cloudflare;

use Com\Prestonhager\Dns\Support\Config;
use Com\Prestonhager\Dns\Support\RecordName;
use Com\Prestonhager\Dns\Support\ServerDnsState;
use Com\Prestonhager\Dns\Support\SrvProfile;
use Pterodactyl\Plugins\Dto\ServerSummary;
use Pterodactyl\Plugins\PluginContext;

class SrvProvisioner
{
    public function __construct(
        private readonly PluginContext $context,
        private readonly Config $config,
        private readonly Client $client,
        private readonly ServerDnsState $state,
    ) {
    }

    public function provision(int $serverId, ?array $profileIds = null): void
    {
        $network = $this->context->servers()->getNetworkSummary($serverId);
        $primary = null;

        foreach ($network->allocations as $allocation) {
            if ($allocation->isPrimary) {
                $primary = $allocation;
                break;
            }
        }

        if (is_null($primary)) {
            return;
        }

        $profiles = $this->resolveProfiles($serverId, $profileIds);
        if ($profiles === []) {
            return;
        }

        $label = RecordName::labelFromServer($network->server);
        $aFqdn = RecordName::fqdn($label, $this->config->baseDomain());

        $this->ensureARecord($serverId, $aFqdn, $primary->ip);

        foreach ($profiles as $profile) {
            $this->provisionSrvProfile($serverId, $network->server, $profile, $label, $aFqdn, $primary->port);
        }
    }

    /**
     * @return SrvProfile[]
     */
    private function resolveProfiles(int $serverId, ?array $profileIds): array
    {
        $available = $this->config->srvProfiles();
        if ($available === []) {
            return [];
        }

        $enabledIds = $profileIds ?? $this->state->srvProfileIds($serverId);
        if ($enabledIds === []) {
            $enabledIds = array_map(
                fn (SrvProfile $profile) => $profile->id,
                array_filter($available, fn (SrvProfile $p) => $p->autoProvision)
            );
            $this->state->setSrvProfileIds($serverId, $enabledIds);
        }

        $byId = [];
        foreach ($available as $profile) {
            $byId[$profile->id] = $profile;
        }

        $selected = [];
        foreach ($enabledIds as $id) {
            if (isset($byId[$id])) {
                $selected[] = $byId[$id];
            }
        }

        return $selected;
    }

    private function ensureARecord(int $serverId, string $fqdn, string $ip): void
    {
        $existingId = $this->state->aRecordId($serverId);
        $payload = [
            'type' => 'A',
            'name' => $fqdn,
            'content' => $ip,
            'ttl' => $this->config->defaultTtl(),
            'proxied' => false,
        ];

        if (!is_null($existingId)) {
            $this->client->updateRecord($existingId, $payload);
            $this->state->setARecord($serverId, $existingId, $fqdn);

            return;
        }

        $result = $this->client->createRecord($payload);
        $id = (string) ($result['result']['id'] ?? '');
        if ($id !== '') {
            $this->state->setARecord($serverId, $id, $fqdn);
            $this->state->upsertRecord($serverId, [
                'cloudflare_id' => $id,
                'type' => 'A',
                'name' => $fqdn,
                'content' => $ip,
                'profile_id' => null,
                'created_at' => now()->toIso8601String(),
                'updated_at' => now()->toIso8601String(),
            ]);
        }
    }

    private function provisionSrvProfile(
        int $serverId,
        ServerSummary $server,
        SrvProfile $profile,
        string $label,
        string $targetHost,
        int $allocationPort,
    ): void {
        $port = $profile->port ?? $allocationPort;
        $relative = RecordName::srvRelativeName($profile, $label);
        $name = RecordName::normalizeName($relative . '.' . $this->config->baseDomain(), $this->config->baseDomain());

        $payload = [
            'type' => 'SRV',
            'name' => $name,
            'ttl' => $this->config->defaultTtl(),
            'proxied' => false,
            'data' => [
                'service' => $profile->service,
                'proto' => $profile->proto,
                'name' => $label,
                'priority' => $profile->priority,
                'weight' => $profile->weight,
                'port' => $port,
                'target' => $targetHost,
            ],
        ];

        $existing = null;
        foreach ($this->state->dnsRecords($serverId) as $record) {
            if (($record['profile_id'] ?? null) === $profile->id && ($record['type'] ?? '') === 'SRV') {
                $existing = $record;
                break;
            }
        }

        if (!is_null($existing) && !empty($existing['cloudflare_id'])) {
            $result = $this->client->updateRecord((string) $existing['cloudflare_id'], $payload);
            $mapped = $this->mapSrvResult($result['result'] ?? [], $profile, $port);
            $this->state->upsertRecord($serverId, $mapped);

            return;
        }

        $result = $this->client->createRecord($payload);
        $mapped = $this->mapSrvResult($result['result'] ?? [], $profile, $port);
        $this->state->upsertRecord($serverId, $mapped);

        $this->context->activity()->log('srv-record-provisioned', [
            'server_id' => $serverId,
            'server_uuid' => $server->uuid,
            'profile_id' => $profile->id,
            'service' => $profile->service,
            'proto' => $profile->proto,
            'port' => $port,
        ]);
    }

    /**
     * @param array<string, mixed> $result
     * @return array<string, mixed>
     */
    private function mapSrvResult(array $result, SrvProfile $profile, int $port): array
    {
        return [
            'cloudflare_id' => (string) ($result['id'] ?? ''),
            'type' => 'SRV',
            'name' => (string) ($result['name'] ?? ''),
            'data' => $result['data'] ?? null,
            'profile_id' => $profile->id,
            'service' => $profile->service,
            'proto' => $profile->proto,
            'port' => $port,
            'label' => $profile->label,
            'created_at' => now()->toIso8601String(),
            'updated_at' => now()->toIso8601String(),
        ];
    }
}
