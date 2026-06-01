<?php

namespace Com\Prestonhager\Dns\Listeners;

use Com\Prestonhager\Dns\Jobs\DeleteDnsRecordsJob;
use Pterodactyl\Events\Server\Deleting;
use Pterodactyl\Plugins\PluginContext;

class OnServerDeleting
{
    public function handle(PluginContext $context, Deleting $event): void
    {
        DeleteDnsRecordsJob::dispatch($event->server->id);
    }
}
