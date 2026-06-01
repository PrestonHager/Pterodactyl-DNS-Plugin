# DNS Plugin for Pterodactyl

Manage Cloudflare DNS records from the Pterodactyl panel. Supports full CRUD for common record types, multi-service SRV profiles (Minecraft Java TCP, Factorio UDP, Bedrock UDP, custom games), and automatic SRV provisioning when a server finishes installing.

Requires the [PrestonHager/panel](https://github.com/PrestonHager/panel) branch **`feat/plugin-manager`** with **plugin API v2.0**.

## Features

- Cloudflare DNS integration (A, AAAA, CNAME, MX, TXT, SRV)
- Server tab UI loaded from this plugin (`assets/dns.js`)
- Plugin-owned HTTP API at `/api/plugins/com.prestonhager.dns/...`
- Multiple SRV service/protocol profiles per server
- Auto-provision A + SRV records on `server.installed`
- Cleanup on `server.deleted` / deleting hook
- Subuser permissions: `records.read`, `records.create`, `records.update`, `records.delete`

## Installation

1. Run a panel build that includes plugin API v2 (`PanelPluginApi::VERSION = 2.0`).
2. Admin → **Plugins** → **Install Plugin** → `PrestonHager/DNS-Pterodactyl-Plugin` (or your fork URL).
3. Open **Plugins → DNS Records → Settings** and paste configuration JSON (see below).
4. Review permissions and click **Enable**.

Ensure outbound HTTP is allowed:

```bash
PTERODACTYL_PLUGIN_HTTP_ALLOWED_HOSTS=api.cloudflare.com
```

(Default in panel config often includes this host.)

## Admin configuration

Example `plugins.config` JSON (Admin → Plugins → Settings):

```json
{
  "cloudflare_api_token": "your-cloudflare-api-token",
  "zone_id": "your-zone-id",
  "base_domain": "example.com",
  "default_ttl": 1,
  "auto_provision_enabled": true,
  "srv_profiles": [
    {
      "id": "minecraft-java",
      "preset": "minecraft-java",
      "label": "Minecraft Java",
      "auto_provision": true
    },
    {
      "id": "factorio-main",
      "preset": "factorio",
      "label": "Factorio",
      "auto_provision": true
    },
    {
      "id": "bedrock",
      "preset": "minecraft-bedrock",
      "auto_provision": false
    },
    {
      "id": "valheim",
      "service": "_valheim",
      "proto": "_udp",
      "label": "Valheim",
      "auto_provision": false
    }
  ]
}
```

### Built-in SRV presets

| Preset ID | Service | Protocol |
|-----------|---------|----------|
| `minecraft-java` | `_minecraft` | `_tcp` |
| `minecraft-bedrock` | `_minecraft` | `_udp` |
| `factorio` | `_factorio` | `_udp` |
| `terraria` | `_terraria` | `_tcp` |
| `rust` | `_rust` | `_tcp` |
| `valheim` | `_valheim` | `_udp` |
| `ark` | `_ark` | `_udp` |
| `mumble` | `_mumble` | `_tcp` |

Custom profiles use `"service"` and `"proto"` (`_tcp` or `_udp`). Omit `"port"` to use the server's primary allocation port.

## Client usage

1. Open a server in the panel.
2. Click the **DNS** tab (visible when the plugin is enabled and the user has `records.read`).
3. Enable SRV profiles for that server and click **Sync SRV records**, or add records manually.
4. On server install, profiles marked `auto_provision: true` create an A record and matching SRV records automatically.

## API (plugin-owned)

All routes require client authentication and server access. Base path:

```
/api/plugins/com.prestonhager.dns
```

| Method | Path | Permission |
|--------|------|------------|
| GET | `/servers/{uuid}/records` | `records.read` |
| POST | `/servers/{uuid}/records` | `records.create` |
| PATCH | `/servers/{uuid}/records/{recordId}` | `records.update` |
| DELETE | `/servers/{uuid}/records/{recordId}` | `records.delete` |
| GET | `/servers/{uuid}/srv-profiles` | `records.read` |
| PUT | `/servers/{uuid}/srv-profiles` | `records.update` |
| POST | `/servers/{uuid}/srv-profiles/sync` | `records.update` |

See panel docs: [plugin-http-api.md](https://github.com/PrestonHager/panel/blob/feat/plugin-manager/docs/plugins/plugin-http-api.md).

## Manual test checklist

- [ ] Install and enable plugin with valid Cloudflare config
- [ ] DNS tab appears on a server
- [ ] Enable Minecraft + Factorio profiles, sync, verify records in Cloudflare
- [ ] Create manual TXT record via UI
- [ ] Delete a record via UI
- [ ] Create new server → auto SRV + A records appear (when `auto_provision_enabled`)
- [ ] Delete server → plugin removes tracked Cloudflare records
- [ ] Subuser with only `records.read` cannot create/delete

## Development

Copy this repo into panel test fixtures or install via Admin using a local Git URL. Reference implementation patterns: panel `tests/Fixtures/plugins/test-plugin/`.

Panel plugin documentation: [docs/plugins/README.md](https://github.com/PrestonHager/panel/blob/feat/plugin-manager/docs/plugins/README.md).

## License

MIT (adjust as needed for your distribution.)
