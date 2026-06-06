<?php

namespace Com\Prestonhager\Dns\Support;

use Pterodactyl\Plugins\PluginContext;

class ServerDnsState
{
    private const STATE_KEY = 'dns_state';

    /** Matches panel PluginSettingsStore::SERVER_SETTINGS_KEY */
    private const PLUGIN_SETTINGS_KEY = 'plugin_settings';

    public function __construct(
        private readonly PluginContext $context,
    ) {
    }

    /**
     * @return array<string, mixed>
     */
    public function all(int $serverId): array
    {
        $state = $this->context->data()->get('server', $serverId, self::STATE_KEY, []);

        return is_array($state) ? $this->normalize($state) : $this->emptyState();
    }

    public function save(int $serverId, array $state): void
    {
        $this->context->data()->set('server', $serverId, self::STATE_KEY, $this->normalize($state));
    }

    /**
     * @return string[]
     */
    public function srvProfileIds(int $serverId): array
    {
        $settings = $this->pluginSettings($serverId);
        if (array_key_exists('enabled_profile_ids', $settings) && is_array($settings['enabled_profile_ids'])) {
            return array_values(array_map('strval', $settings['enabled_profile_ids']));
        }

        return $this->all($serverId)['srv_profile_ids'];
    }

    /**
     * @param string[] $ids
     */
    public function setSrvProfileIds(int $serverId, array $ids): void
    {
        $ids = array_values(array_unique(array_map('strval', $ids)));

        $state = $this->all($serverId);
        $state['srv_profile_ids'] = $ids;
        $this->save($serverId, $state);

        $settings = $this->pluginSettings($serverId);
        $settings['enabled_profile_ids'] = $ids;
        $this->writePluginSettings($serverId, $settings);
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function dnsRecords(int $serverId): array
    {
        return $this->all($serverId)['dns_records'];
    }

    public function findRecord(int $serverId, string $cloudflareId): ?array
    {
        foreach ($this->dnsRecords($serverId) as $record) {
            if (($record['cloudflare_id'] ?? '') === $cloudflareId) {
                return $record;
            }
        }

        return null;
    }

    public function findRecordByProfile(int $serverId, string $profileId): ?array
    {
        foreach ($this->dnsRecords($serverId) as $record) {
            if (($record['profile_id'] ?? null) === $profileId && ($record['type'] ?? '') === 'SRV') {
                return $record;
            }
        }

        return null;
    }

    public function upsertRecord(int $serverId, array $record): void
    {
        $state = $this->all($serverId);
        $records = $state['dns_records'];
        $found = false;

        foreach ($records as $index => $existing) {
            if (($existing['cloudflare_id'] ?? '') === ($record['cloudflare_id'] ?? '')) {
                $records[$index] = array_merge($existing, $record);
                $found = true;
                break;
            }
        }

        if (!$found) {
            $records[] = $record;
        }

        $state['dns_records'] = $records;
        $this->save($serverId, $state);
    }

    public function removeRecord(int $serverId, string $cloudflareId): void
    {
        $state = $this->all($serverId);
        $state['dns_records'] = array_values(array_filter(
            $state['dns_records'],
            fn (array $record) => ($record['cloudflare_id'] ?? '') !== $cloudflareId
        ));
        $this->save($serverId, $state);
    }

    public function removeRecordsByProfile(int $serverId, string $profileId): void
    {
        $state = $this->all($serverId);
        $state['dns_records'] = array_values(array_filter(
            $state['dns_records'],
            fn (array $record) => ($record['profile_id'] ?? null) !== $profileId
        ));
        $this->save($serverId, $state);
    }

    public function aRecordId(int $serverId): ?string
    {
        $id = $this->all($serverId)['a_record_id'];

        return is_string($id) && $id !== '' ? $id : null;
    }

    public function aRecordName(int $serverId): ?string
    {
        $name = $this->all($serverId)['a_record_name'];

        return is_string($name) && $name !== '' ? $name : null;
    }

    public function setARecord(int $serverId, string $cloudflareId, string $name): void
    {
        $state = $this->all($serverId);
        $state['a_record_id'] = $cloudflareId;
        $state['a_record_name'] = $name;
        $this->save($serverId, $state);
    }

    public function clear(int $serverId): void
    {
        $this->context->data()->delete('server', $serverId, self::STATE_KEY);
    }

    /**
     * @return array<string, mixed>
     */
    private function pluginSettings(int $serverId): array
    {
        $settings = $this->context->data()->get('server', $serverId, self::PLUGIN_SETTINGS_KEY, []);

        return is_array($settings) ? $settings : [];
    }

    /**
     * @param array<string, mixed> $settings
     */
    private function writePluginSettings(int $serverId, array $settings): void
    {
        $this->context->data()->set('server', $serverId, self::PLUGIN_SETTINGS_KEY, $settings);
    }

    /**
     * @return array<string, mixed>
     */
    private function emptyState(): array
    {
        return [
            'srv_profile_ids' => [],
            'a_record_id' => null,
            'a_record_name' => null,
            'dns_records' => [],
        ];
    }

    /**
     * @param array<string, mixed> $state
     * @return array<string, mixed>
     */
    private function normalize(array $state): array
    {
        return [
            'srv_profile_ids' => array_values(array_map(
                'strval',
                is_array($state['srv_profile_ids'] ?? null) ? $state['srv_profile_ids'] : []
            )),
            'a_record_id' => isset($state['a_record_id']) ? (string) $state['a_record_id'] : null,
            'a_record_name' => isset($state['a_record_name']) ? (string) $state['a_record_name'] : null,
            'dns_records' => is_array($state['dns_records'] ?? null) ? array_values($state['dns_records']) : [],
        ];
    }
}
