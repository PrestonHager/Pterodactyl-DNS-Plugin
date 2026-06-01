<?php

namespace Com\Prestonhager\Dns;

use Pterodactyl\Plugins\PluginContext;
use Pterodactyl\Plugins\Contracts\PluginInterface;
use Pterodactyl\Plugins\Exceptions\PluginException;

class Plugin implements PluginInterface
{
    public function register(PluginContext $context): void
    {
        $required = ['cloudflare_api_token', 'zone_id', 'base_domain'];

        foreach ($required as $key) {
            $value = $context->config()->get($key);
            if (!is_string($value) || trim($value) === '') {
                throw new PluginException(sprintf(
                    'DNS plugin is missing required config key "%s". Configure it under Admin → Plugins → Settings.',
                    $key
                ));
            }
        }
    }
}
