<?php

namespace Com\Prestonhager\Dns\Support;

use Pterodactyl\Plugins\PluginContext;
use Pterodactyl\Plugins\Exceptions\PluginException;

class Config
{
    public function __construct(
        private readonly PluginContext $context,
    ) {
    }

    public function cloudflareApiToken(): string
    {
        return $this->requireString('cloudflare_api_token');
    }

    public function zoneId(): string
    {
        return $this->requireString('zone_id');
    }

    public function baseDomain(): string
    {
        return rtrim($this->requireString('base_domain'), '.');
    }

    public function defaultTtl(): int
    {
        $ttl = $this->context->config()->get('default_ttl', 1);

        return is_numeric($ttl) ? (int) $ttl : 1;
    }

    public function autoProvisionEnabled(): bool
    {
        $value = $this->context->config()->get('auto_provision_enabled', true);

        return filter_var($value, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE) ?? (bool) $value;
    }

    /**
     * @return SrvProfile[]
     */
    public function srvProfiles(): array
    {
        $raw = $this->context->config()->get('srv_profiles', []);
        if (!is_array($raw)) {
            return [];
        }

        $profiles = [];
        foreach ($raw as $entry) {
            if (!is_array($entry)) {
                continue;
            }

            $profile = SrvProfile::fromConfigEntry($entry);
            if (!is_null($profile)) {
                $profiles[] = $profile;
            }
        }

        return $profiles;
    }

    /**
     * @return SrvProfile[]
     */
    public function autoProvisionProfiles(): array
    {
        return array_values(array_filter(
            $this->srvProfiles(),
            fn (SrvProfile $profile) => $profile->autoProvision
        ));
    }

    public function findProfile(string $id): ?SrvProfile
    {
        foreach ($this->srvProfiles() as $profile) {
            if ($profile->id === $id) {
                return $profile;
            }
        }

        return null;
    }

    private function requireString(string $key): string
    {
        $value = $this->context->config()->get($key);
        if (!is_string($value) || trim($value) === '') {
            throw new PluginException(sprintf('DNS plugin config "%s" is not set.', $key));
        }

        return trim($value);
    }
}
