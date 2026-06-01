<?php

namespace Com\Prestonhager\Dns\Jobs;

use Com\Prestonhager\Dns\Services;
use Illuminate\Foundation\Bus\Dispatchable;
use Pterodactyl\Models\Plugin;
use Pterodactyl\Plugins\PluginContextFactory;

class ProvisionSrvProfilesJob
{
    use Dispatchable;

    public function __construct(
        public readonly int $serverId,
    ) {
    }

    public function handle(PluginContextFactory $contextFactory): void
    {
        $plugin = Plugin::query()->find('com.prestonhager.dns');
        if (is_null($plugin) || !$plugin->enabled) {
            return;
        }

        $context = $contextFactory->make($plugin);

        if (!Services::config($context)->autoProvisionEnabled()) {
            return;
        }

        Services::srvProvisioner($context)->provision($this->serverId);
    }
}
