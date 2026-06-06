# DNS Plugin for Pterodactyl

Manage Cloudflare DNS records from the Pterodactyl panel. Supports full CRUD for common record types, multi-service SRV profiles (Minecraft Java TCP, Factorio UDP, Bedrock UDP, custom games), and automatic SRV provisioning when a server finishes installing.

Requires the [PrestonHager/panel](https://github.com/PrestonHager/panel) branch **`feat/plugin-manager`** with **plugin API v2.0**.

## Features

- Cloudflare DNS integration (A, AAAA, CNAME, MX, TXT, SRV)
- **SRV-first** record creation with server-aware defaults (name, target, port)
- **Smart naming** like Cloudflare: bare labels append `base_domain`; relative names like `mc.games` append the zone; full FQDNs resolve the correct zone (including cross-zone records)
- **Smart SRV sync** matches existing records by profile, name, port, and target (IP, alias, or hostname)
- Default SRV target uses the primary allocation **alias** when set, otherwise the allocation **IP**
- Server tab UI loaded from this plugin (`assets/dns.js`) with dark/light theme support
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

### Cloudflare API token scopes

Create a token with:

- **Zone → DNS → Edit** (create/update/delete records)
- **Zone → Zone → Read** (list zones for cross-zone FQDN resolution)

## Admin configuration

Plugin settings are defined in [`settings.json`](settings.json) and rendered as a structured form under **Admin → Plugins → DNS Records → Settings**. Admin-only fields are stored in encrypted `plugins.config`. Legacy JSON editing remains available under **Advanced JSON**.

Example configuration (also valid as Advanced JSON):

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

### Smart naming examples

With `base_domain` = `example.com` and default zone configured:

| User enters | Record created at |
|-------------|-------------------|
| `mc` | `mc.example.com` (default zone) |
| `mc.games` | `mc.games.example.com` (default zone) |
| `mc.example.com` | `mc.example.com` (default zone) |
| `host.other.com` | `host.other.com` (zone resolved via Cloudflare zones API) |

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

Custom profiles use `"service"` and `"proto"` (`_tcp` or `_udp`). Omit `"port"` to use the server's primary allocation port. Custom profile IDs configured in **SRV Profiles** can still be enabled from the DNS tab; preset IDs are also available in the client **Settings** sub-tab.

## Client settings

Per-server SRV profile selection is exposed via the panel **Settings** sub-tab at `/server/{id}/dns/settings` (requires `records.update`). Values are stored in server plugin metadata and stay in sync with the DNS tab profile checkboxes.

## Client usage

1. Open a server in the panel.
2. Click the **DNS** tab (visible when the plugin is enabled and the user has `records.read`).
3. **Add record** defaults to SRV with the server label, allocation target (alias or IP), and port prefilled.
4. Enable SRV profiles for that server and click **Sync SRV records** to create or reconcile records.
5. On server install, profiles marked `auto_provision: true` create an A record and matching SRV records automatically.

Sync updates SRV records when the allocation IP, alias, or port changes, and adopts existing Cloudflare SRV records that match the server's target and port.

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

`GET /srv-profiles` includes a `defaults` object with suggested SRV form values for the server.

See panel docs: [plugin-http-api.md](https://github.com/PrestonHager/panel/blob/feat/plugin-manager/docs/plugins/plugin-http-api.md).

## Manual test checklist

- [ ] Admin **Plugins → Settings** shows structured form (token, zone, domain, SRV profiles JSON)
- [ ] Client **DNS → Settings** sub-tab shows enabled SRV profile multiselect
- [ ] DNS tab appears on a server (client and admin views)
- [ ] Add record form opens with **SRV** selected; name/target/port prefilled
- [ ] Enter `mc` → creates SRV under `mc.example.com` in default zone
- [ ] Enter cross-zone FQDN → record created in matching zone; delete works
- [ ] Primary allocation has alias → SRV target uses alias; sync updates when alias/IP/port changes
- [ ] Pre-existing SRV in Cloudflare (no local state) → sync adopts and updates
- [ ] Enable Minecraft + Factorio profiles, sync, verify records in Cloudflare
- [ ] Create manual TXT record via UI
- [ ] Delete a record via UI
- [ ] Create new server → auto SRV + A records appear (when `auto_provision_enabled`)
- [ ] Delete server → plugin removes tracked Cloudflare records
- [ ] Subuser with only `records.read` cannot create/delete
- [ ] Admin (light) and client (dark) UI: inputs, labels, and table text are readable

## Development

Copy this repo into panel test fixtures or install via Admin using a local Git URL. Reference implementation patterns: panel `tests/Fixtures/plugins/test-plugin/`.

Panel plugin documentation: [docs/plugins/README.md](https://github.com/PrestonHager/panel/blob/feat/plugin-manager/docs/plugins/README.md).

## License

MIT (adjust as needed for your distribution.)
