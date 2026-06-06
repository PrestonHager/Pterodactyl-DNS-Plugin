<?php

namespace Com\Prestonhager\Dns\Http;

use Com\Prestonhager\Dns\Services;
use Pterodactyl\Plugins\Http\PluginHttpRequest;
use Pterodactyl\Plugins\Http\PluginHttpResponse;
use Pterodactyl\Plugins\PluginContext;
use Pterodactyl\Plugins\Exceptions\PluginException;

class RecordsController
{
    public function index(PluginContext $context, PluginHttpRequest $request): PluginHttpResponse
    {
        Services::dnsPolicy($context)->ensureAdminDnsAccess($request);

        $serverId = $this->requireServerId($request);
        $records = Services::dns($context)->listRecordsForServer($serverId);

        return PluginHttpResponse::json([
            'object' => 'list',
            'data' => $records,
        ]);
    }

    public function store(PluginContext $context, PluginHttpRequest $request): PluginHttpResponse
    {
        Services::dnsPolicy($context)->ensureAdminDnsAccess($request);

        $serverId = $this->requireServerId($request);
        $server = $context->servers()->find($serverId);
        $record = Services::dns($context)->createRecord($serverId, $server, $request->body);

        return PluginHttpResponse::json([
            'object' => 'dns_record',
            'attributes' => $record,
        ], 201);
    }

    public function update(PluginContext $context, PluginHttpRequest $request): PluginHttpResponse
    {
        Services::dnsPolicy($context)->ensureAdminDnsAccess($request);

        $serverId = $this->requireServerId($request);
        $recordId = (string) $request->route('recordId', '');
        $server = $context->servers()->find($serverId);
        $record = Services::dns($context)->updateRecord($serverId, $server, $recordId, $request->body);

        return PluginHttpResponse::json([
            'object' => 'dns_record',
            'attributes' => $record,
        ]);
    }

    public function destroy(PluginContext $context, PluginHttpRequest $request): PluginHttpResponse
    {
        Services::dnsPolicy($context)->ensureAdminDnsAccess($request);

        $serverId = $this->requireServerId($request);
        $recordId = (string) $request->route('recordId', '');
        Services::dns($context)->deleteRecord($serverId, $recordId);

        return PluginHttpResponse::json([], 204);
    }

    private function requireServerId(PluginHttpRequest $request): int
    {
        if (is_null($request->serverId)) {
            throw new PluginException('Server context is required.');
        }

        return $request->serverId;
    }
}
