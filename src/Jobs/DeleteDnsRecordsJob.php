<?php

namespace Com\Prestonhager\Dns\Jobs;

use Com\Prestonhager\Dns\Services;
use Illuminate\Foundation\Bus\Dispatchable;
use Pterodactyl\Models\Plugin;
use Pterodactyl\Plugins\PluginContextFactory;

class DeleteDnsRecordsJob
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
        Services::dns($context)->deleteAllForServer($this->serverId);

        $context->activity()->log('dns-records-deleted', [
            'server_id' => $this->serverId,
        ]);
    }
}
