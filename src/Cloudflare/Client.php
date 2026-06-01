<?php

namespace Com\Prestonhager\Dns\Cloudflare;

use Com\Prestonhager\Dns\Support\Config;
use Pterodactyl\Plugins\PluginContext;
use Pterodactyl\Plugins\Exceptions\PluginException;

class Client
{
    private const BASE = 'https://api.cloudflare.com/client/v4';

    public function __construct(
        private readonly PluginContext $context,
        private readonly Config $config,
    ) {
    }

    /**
     * @param array<string, mixed> $payload
     * @return array<string, mixed>
     */
    public function createRecord(array $payload): array
    {
        return $this->request('POST', $this->zonePath('/dns_records'), ['json' => $payload]);
    }

    /**
     * @param array<string, mixed> $payload
     * @return array<string, mixed>
     */
    public function updateRecord(string $recordId, array $payload): array
    {
        return $this->request('PATCH', $this->zonePath('/dns_records/' . $recordId), ['json' => $payload]);
    }

    /**
     * @return array<string, mixed>
     */
    public function deleteRecord(string $recordId): array
    {
        return $this->request('DELETE', $this->zonePath('/dns_records/' . $recordId));
    }

    /**
     * @return array<string, mixed>
     */
    public function getRecord(string $recordId): array
    {
        return $this->request('GET', $this->zonePath('/dns_records/' . $recordId));
    }

    /**
     * @return array<string, mixed>
     */
    private function request(string $method, string $url, array $options = []): array
    {
        $options['headers'] = array_merge($options['headers'] ?? [], [
            'Authorization' => 'Bearer ' . $this->config->cloudflareApiToken(),
            'Content-Type' => 'application/json',
            'Accept' => 'application/json',
        ]);

        $response = $this->context->http()->request($method, $url, $options);
        $decoded = json_decode($response['body'], true);

        if (!is_array($decoded)) {
            throw new PluginException('Cloudflare returned an invalid JSON response.');
        }

        if ($response['status'] >= 400 || !($decoded['success'] ?? false)) {
            $errors = $decoded['errors'] ?? [];
            $message = is_array($errors) && isset($errors[0]['message'])
                ? (string) $errors[0]['message']
                : 'Cloudflare API request failed.';

            throw new PluginException($message);
        }

        return $decoded;
    }

    private function zonePath(string $suffix): string
    {
        return self::BASE . '/zones/' . $this->config->zoneId() . $suffix;
    }
}
