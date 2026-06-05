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

    public static function resolve(string $name, ZoneResolver $resolver): ResolvedZoneName
    {
        return $resolver->resolve($name);
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

        if (!self::looksLikeExternalFqdn($name, $baseDomain)) {
            return rtrim($name, '.') . '.' . $baseDomain;
        }

        return rtrim($name, '.');
    }

    public static function relativeLabel(string $fqdn, string $zoneName): string
    {
        $lowerFqdn = strtolower($fqdn);
        $lowerZone = strtolower(rtrim($zoneName, '.'));

        if ($lowerFqdn === $lowerZone) {
            return '@';
        }

        $suffix = '.' . $lowerZone;
        if (str_ends_with($lowerFqdn, $suffix)) {
            return substr($fqdn, 0, -strlen($suffix));
        }

        return $fqdn;
    }

    private static function looksLikeExternalFqdn(string $name, string $baseDomain): bool
    {
        $parts = explode('.', $name);
        if (count($parts) < 2) {
            return false;
        }

        $tld = strtolower(end($parts));
        if (!preg_match('/^[a-z]{2,63}$/', $tld)) {
            return false;
        }

        $lowerName = strtolower($name);
        $lowerBase = strtolower($baseDomain);

        return $lowerName !== $lowerBase && !str_ends_with($lowerName, '.' . $lowerBase);
    }
}
