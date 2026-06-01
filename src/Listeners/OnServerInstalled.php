<?php

namespace Com\Prestonhager\Dns\Listeners;

use Com\Prestonhager\Dns\Jobs\ProvisionSrvProfilesJob;
use Pterodactyl\Events\Server\Installed;
use Pterodactyl\Plugins\PluginContext;

class OnServerInstalled
{
    public function handle(PluginContext $context, Installed $event): void
    {
        ProvisionSrvProfilesJob::dispatch($event->server->id);
    }
}
