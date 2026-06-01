<?php

namespace Com\Prestonhager\Dns\Support;

use Pterodactyl\Plugins\Dto\ServerSummary;

class RecordName
{
    public static function labelFromServer(ServerSummary $server): string
    {
        $base = strtolower($server->name);
        $base = preg_replace('/[^a-z0-9]+/', '-', $base) ?? 'server';
        $base = trim($base, '-');

        if ($base === '') {
            $base = 'server';
        }

        $suffix = substr(str_replace('-', '', $server->uuid), 0, 8);

        return substr($base, 0, 48) . '-' . $suffix;
    }

    public static function fqdn(string $label, string $baseDomain): string
    {
        return $label . '.' . rtrim($baseDomain, '.');
    }

    public static function srvRelativeName(SrvProfile $profile, string $label): string
    {
        $service = ltrim($profile->service, '_');
        $proto = ltrim($profile->proto, '_');

        return sprintf('_%s._%s.%s', $service, $proto, $label);
    }

    public static function normalizeName(string $name, string $baseDomain): string
    {
        $name = trim($name);
        if (str_ends_with(strtolower($name), '.' . strtolower($baseDomain))) {
            return rtrim($name, '.');
        }

        if (!str_contains($name, '.')) {
            return $name . '.' . $baseDomain;
        }

        return rtrim($name, '.');
    }
}
