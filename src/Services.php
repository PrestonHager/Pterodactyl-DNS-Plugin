<?php

namespace Com\Prestonhager\Dns;

use Com\Prestonhager\Dns\Cloudflare\Client;
use Com\Prestonhager\Dns\Cloudflare\DnsService;
use Com\Prestonhager\Dns\Cloudflare\SrvProvisioner;
use Com\Prestonhager\Dns\Cloudflare\SrvRecordMatcher;
use Com\Prestonhager\Dns\Support\Config;
use Com\Prestonhager\Dns\Support\ServerDnsState;
use Com\Prestonhager\Dns\Support\ZoneResolver;
use Pterodactyl\Plugins\PluginContext;

final class Services
{
    public static function config(PluginContext $context): Config
    {
        return new Config($context);
    }

    public static function state(PluginContext $context): ServerDnsState
    {
        return new ServerDnsState($context);
    }

    public static function client(PluginContext $context): Client
    {
        return new Client($context, self::config($context));
    }

    public static function zoneResolver(PluginContext $context): ZoneResolver
    {
        return new ZoneResolver(self::client($context), self::config($context));
    }

    public static function srvMatcher(PluginContext $context): SrvRecordMatcher
    {
        return new SrvRecordMatcher(self::client($context));
    }

    public static function dns(PluginContext $context): DnsService
    {
        $config = self::config($context);

        return new DnsService(
            $context,
            $config,
            self::client($context),
            self::state($context),
            self::zoneResolver($context),
        );
    }

    public static function srvProvisioner(PluginContext $context): SrvProvisioner
    {
        $config = self::config($context);

        return new SrvProvisioner(
            $context,
            $config,
            self::client($context),
            self::state($context),
            self::srvMatcher($context),
        );
    }
}
