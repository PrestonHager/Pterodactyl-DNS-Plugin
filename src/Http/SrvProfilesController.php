<?php

namespace Com\Prestonhager\Dns\Http;

use Com\Prestonhager\Dns\Services;
use Com\Prestonhager\Dns\Support\RecordName;
use Com\Prestonhager\Dns\Support\SrvPresets;
use Com\Prestonhager\Dns\Support\SrvProfile;
use Pterodactyl\Plugins\Dto\AllocationSummary;
use Pterodactyl\Plugins\Http\PluginHttpRequest;
use Pterodactyl\Plugins\Http\PluginHttpResponse;
use Pterodactyl\Plugins\PluginContext;
use Pterodactyl\Plugins\Exceptions\PluginException;

class SrvProfilesController
{
    public function index(PluginContext $context, PluginHttpRequest $request): PluginHttpResponse
    {
        $serverId = $this->requireServerId($request);
        $config = Services::config($context);
        $state = Services::state($context);

        $profiles = array_map(
            fn ($profile) => $profile->toArray(),
            $config->srvProfiles()
        );

        $enabled = $state->srvProfileIds($serverId);
        if ($enabled === []) {
            $enabled = array_map(
                fn ($profile) => $profile->id,
                $config->autoProvisionProfiles()
            );
        }

        return PluginHttpResponse::json([
            'object' => 'srv_profiles',
            'attributes' => [
                'profiles' => $profiles,
                'enabled' => $enabled,
                'presets' => array_keys(SrvPresets::all()),
                'defaults' => $this->buildDefaults($context, $serverId, $config->srvProfiles(), $enabled),
            ],
        ]);
    }

    public function update(PluginContext $context, PluginHttpRequest $request): PluginHttpResponse
    {
        $serverId = $this->requireServerId($request);
        $enabled = $request->body['enabled'] ?? null;

        if (!is_array($enabled)) {
            throw new PluginException('Request body must include an "enabled" array of profile IDs.');
        }

        $config = Services::config($context);
        $validIds = array_map(fn ($p) => $p->id, $config->srvProfiles());
        $filtered = array_values(array_intersect(array_map('strval', $enabled), $validIds));

        Services::state($context)->setSrvProfileIds($serverId, $filtered);

        return PluginHttpResponse::json([
            'object' => 'srv_profiles',
            'attributes' => [
                'enabled' => $filtered,
            ],
        ]);
    }

    public function sync(PluginContext $context, PluginHttpRequest $request): PluginHttpResponse
    {
        $serverId = $this->requireServerId($request);
        Services::srvProvisioner($context)->provision($serverId);

        return PluginHttpResponse::json([
            'object' => 'srv_profiles',
            'attributes' => [
                'synced' => true,
                'records' => Services::state($context)->dnsRecords($serverId),
            ],
        ]);
    }

    /**
     * @param SrvProfile[] $profiles
     * @param string[] $enabled
     * @return array<string, mixed>
     */
    private function buildDefaults(PluginContext $context, int $serverId, array $profiles, array $enabled): array
    {
        $config = Services::config($context);
        $network = $context->servers()->getNetworkSummary($serverId);
        $primary = $this->primaryAllocation($network->allocations);
        $label = RecordName::labelFromServer($network->server);
        $baseDomain = $config->baseDomain();

        $target = '';
        $port = 25565;
        if (!is_null($primary)) {
            $target = ($primary->ipAlias !== null && $primary->ipAlias !== '')
                ? $primary->ipAlias
                : $primary->ip;
            $port = $primary->port;
        }

        $profile = $this->firstProfile($profiles, $enabled);

        return [
            'record_type' => 'SRV',
            'name' => $label,
            'base_domain' => $baseDomain,
            'target' => $target,
            'port' => $port,
            'service' => $profile?->service ?? '_minecraft',
            'proto' => $profile?->proto ?? '_tcp',
            'priority' => $profile?->priority ?? 0,
            'weight' => $profile?->weight ?? 5,
        ];
    }

    /**
     * @param AllocationSummary[] $allocations
     */
    private function primaryAllocation(array $allocations): ?AllocationSummary
    {
        foreach ($allocations as $allocation) {
            if ($allocation->isPrimary) {
                return $allocation;
            }
        }

        return null;
    }

    /**
     * @param SrvProfile[] $profiles
     * @param string[] $enabled
     */
    private function firstProfile(array $profiles, array $enabled): ?SrvProfile
    {
        if ($profiles === []) {
            return null;
        }

        $byId = [];
        foreach ($profiles as $profile) {
            $byId[$profile->id] = $profile;
        }

        foreach ($enabled as $id) {
            if (isset($byId[$id])) {
                return $byId[$id];
            }
        }

        return $profiles[0];
    }

    private function requireServerId(PluginHttpRequest $request): int
    {
        if (is_null($request->serverId)) {
            throw new PluginException('Server context is required.');
        }

        return $request->serverId;
    }
}
