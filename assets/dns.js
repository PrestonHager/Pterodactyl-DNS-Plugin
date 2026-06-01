window.PterodactylPlugin_com_prestonhager_dns = function () {
    'use strict';

    var PLUGIN_ID = 'com.prestonhager.dns';
    var ctx = window.__PterodactylPluginContext;
    var root = document.getElementById('plugin-root-' + PLUGIN_ID);

    if (!ctx || !root) {
        return;
    }

    function perms() {
        return ctx.getPermissions() || [];
    }

    function can(permission) {
        var p = perms();
        return p.indexOf('*') !== -1 || p.indexOf(permission) !== -1;
    }

    function api(path, options) {
        options = options || {};
        var url = ctx.apiBase + path;
        return fetch(url, {
            credentials: 'same-origin',
            method: options.method || 'GET',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
            body: options.body ? JSON.stringify(options.body) : undefined,
        }).then(function (response) {
            if (response.status === 204) {
                return null;
            }
            return response.json().then(function (data) {
                if (!response.ok) {
                    var msg =
                        (data && data.errors && data.errors[0] && data.errors[0].detail) ||
                        (data && data.message) ||
                        'Request failed';
                    throw new Error(msg);
                }
                return data;
            });
        });
    }

    function serverPath(suffix) {
        return '/servers/' + encodeURIComponent(ctx.serverUuid) + suffix;
    }

    function escapeHtml(text) {
        var div = document.createElement('div');
        div.textContent = text == null ? '' : String(text);
        return div.innerHTML;
    }

    var state = {
        profiles: [],
        enabled: [],
        records: [],
        loading: true,
        error: '',
        modal: null,
    };

    function render() {
        root.innerHTML =
            '<div class="dns-plugin" style="padding:1rem;color:#eee;font-family:system-ui,sans-serif;">' +
            '<style>' +
            '.dns-plugin table{width:100%;border-collapse:collapse;margin-top:1rem;}' +
            '.dns-plugin th,.dns-plugin td{border:1px solid #444;padding:.5rem;text-align:left;}' +
            '.dns-plugin button{margin-right:.5rem;margin-top:.5rem;padding:.4rem .8rem;cursor:pointer;}' +
            '.dns-plugin .error{color:#f87171;margin:.5rem 0;}' +
            '.dns-plugin .section{margin-bottom:2rem;}' +
            '.dns-plugin label{display:block;margin:.25rem 0;}' +
            '.dns-plugin input,.dns-plugin select{width:100%;max-width:320px;padding:.35rem;margin-bottom:.5rem;}' +
            '.dns-plugin .profile-row{display:flex;align-items:center;gap:.5rem;margin:.25rem 0;}' +
            '.dns-plugin .modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9999;}' +
            '.dns-plugin .modal{background:#1e1e1e;padding:1.5rem;border:1px solid #444;min-width:320px;max-width:480px;}' +
            '</style>' +
            '<h2 style="margin:0 0 1rem;">DNS Records</h2>' +
            (state.error ? '<p class="error">' + escapeHtml(state.error) + '</p>' : '') +
            (state.loading ? '<p>Loading…</p>' : renderContent()) +
            '</div>';

        bindEvents();
    }

    function renderContent() {
        return renderProfilesSection() + renderRecordsSection() + (state.modal ? renderModal() : '');
    }

    function renderProfilesSection() {
        if (!can('records.read')) {
            return '';
        }

        var html =
            '<div class="section"><h3>SRV Profiles</h3>' +
            '<p style="color:#aaa;font-size:.9rem;">Enable game/service SRV records (Minecraft TCP, Factorio UDP, etc.) for this server.</p>';

        if (state.profiles.length === 0) {
            html += '<p style="color:#888;">No SRV profiles configured. Add <code>srv_profiles</code> in Admin → Plugins → Settings.</p>';
        }

        state.profiles.forEach(function (profile) {
            var checked = state.enabled.indexOf(profile.id) !== -1 ? ' checked' : '';
            var disabled = can('records.update') ? '' : ' disabled';
            html +=
                '<div class="profile-row">' +
                '<input type="checkbox" data-profile-id="' +
                escapeHtml(profile.id) +
                '"' +
                checked +
                disabled +
                ' id="profile-' +
                escapeHtml(profile.id) +
                '">' +
                '<label for="profile-' +
                escapeHtml(profile.id) +
                '">' +
                escapeHtml(profile.label) +
                ' <code style="color:#888;">' +
                escapeHtml(profile.service + profile.proto) +
                '</code></label></div>';
        });

        if (can('records.update') && state.profiles.length > 0) {
            html +=
                '<button type="button" data-action="save-profiles">Save profiles</button>' +
                '<button type="button" data-action="sync-profiles">Sync SRV records</button>';
        }

        return html + '</div>';
    }

    function renderRecordsSection() {
        var html = '<div class="section"><h3>Records</h3>';

        if (can('records.create')) {
            html += '<button type="button" data-action="new-record">Add record</button>';
        }

        html += '<table><thead><tr><th>Type</th><th>Name</th><th>Details</th><th></th></tr></thead><tbody>';

        if (state.records.length === 0) {
            html += '<tr><td colspan="4" style="color:#888;">No records yet.</td></tr>';
        } else {
            state.records.forEach(function (record) {
                var details = record.content || '';
                if (record.type === 'SRV') {
                    details =
                        (record.service || '') +
                        (record.proto || '') +
                        ' → ' +
                        (record.data && record.data.target ? record.data.target : '') +
                        ':' +
                        (record.port || (record.data && record.data.port) || '');
                }
                if (record.profile_id) {
                    details = (record.label || record.profile_id) + ' — ' + details;
                }

                html +=
                    '<tr><td>' +
                    escapeHtml(record.type) +
                    '</td><td>' +
                    escapeHtml(record.name) +
                    '</td><td>' +
                    escapeHtml(details) +
                    '</td><td>';

                if (can('records.delete')) {
                    html +=
                        '<button type="button" data-action="delete-record" data-id="' +
                        escapeHtml(record.cloudflare_id) +
                        '">Delete</button>';
                }

                html += '</td></tr>';
            });
        }

        return html + '</tbody></table></div>';
    }

    function renderModal() {
        var m = state.modal;
        return (
            '<div class="modal-backdrop" data-action="close-modal">' +
            '<div class="modal" data-action="stop">' +
            '<h3 style="margin-top:0;">New DNS record</h3>' +
            '<label>Type<select id="dns-type">' +
            ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV']
                .map(function (t) {
                    return '<option value="' + t + '"' + (m.type === t ? ' selected' : '') + '>' + t + '</option>';
                })
                .join('') +
            '</select></label>' +
            '<label>Name<input id="dns-name" placeholder="subdomain or FQDN" value="' +
            escapeHtml(m.name || '') +
            '"></label>' +
            '<div id="dns-fields">' +
            renderModalFields(m.type) +
            '</div>' +
            '<button type="button" data-action="submit-record">Create</button>' +
            '<button type="button" data-action="close-modal">Cancel</button>' +
            '</div></div>'
        );
    }

    function renderModalFields(type) {
        if (type === 'SRV') {
            return (
                '<label>Service<input id="dns-service" placeholder="_minecraft" value="_minecraft"></label>' +
                '<label>Protocol<select id="dns-proto"><option value="_tcp">TCP (_tcp)</option><option value="_udp">UDP (_udp)</option></select></label>' +
                '<label>Target<input id="dns-target" placeholder="host.example.com"></label>' +
                '<label>Port<input id="dns-port" type="number" value="25565"></label>' +
                '<label>Priority<input id="dns-priority" type="number" value="0"></label>' +
                '<label>Weight<input id="dns-weight" type="number" value="5"></label>'
            );
        }
        if (type === 'MX') {
            return (
                '<label>Mail server<input id="dns-content" placeholder="mail.example.com"></label>' +
                '<label>Priority<input id="dns-priority" type="number" value="10"></label>'
            );
        }
        return '<label>Content<input id="dns-content" placeholder="Record value"></label>';
    }

    function bindEvents() {
        root.querySelectorAll('[data-action="save-profiles"]').forEach(function (btn) {
            btn.onclick = saveProfiles;
        });
        root.querySelectorAll('[data-action="sync-profiles"]').forEach(function (btn) {
            btn.onclick = syncProfiles;
        });
        root.querySelectorAll('[data-action="new-record"]').forEach(function (btn) {
            btn.onclick = function () {
                state.modal = { type: 'A', name: '' };
                render();
            };
        });
        root.querySelectorAll('[data-action="delete-record"]').forEach(function (btn) {
            btn.onclick = function () {
                deleteRecord(btn.getAttribute('data-id'));
            };
        });
        root.querySelectorAll('[data-action="close-modal"]').forEach(function (btn) {
            btn.onclick = function (e) {
                if (e.target.getAttribute('data-action') === 'stop') {
                    e.stopPropagation();
                    return;
                }
                state.modal = null;
                render();
            };
        });
        root.querySelectorAll('[data-action="stop"]').forEach(function (el) {
            el.onclick = function (e) {
                e.stopPropagation();
            };
        });
        root.querySelectorAll('[data-action="submit-record"]').forEach(function (btn) {
            btn.onclick = submitRecord;
        });

        var typeSelect = root.querySelector('#dns-type');
        if (typeSelect) {
            typeSelect.onchange = function () {
                state.modal.type = typeSelect.value;
                render();
            };
        }
    }

    function load() {
        state.loading = true;
        state.error = '';
        render();

        Promise.all([api(serverPath('/srv-profiles')), api(serverPath('/records'))])
            .then(function (results) {
                state.profiles = (results[0].attributes && results[0].attributes.profiles) || [];
                state.enabled = (results[0].attributes && results[0].attributes.enabled) || [];
                state.records = results[1].data || [];
                state.loading = false;
                render();
            })
            .catch(function (err) {
                state.loading = false;
                state.error = err.message || String(err);
                render();
            });
    }

    function saveProfiles() {
        var enabled = [];
        root.querySelectorAll('input[data-profile-id]').forEach(function (input) {
            if (input.checked) {
                enabled.push(input.getAttribute('data-profile-id'));
            }
        });

        state.error = '';
        api(serverPath('/srv-profiles'), { method: 'PUT', body: { enabled: enabled } })
            .then(load)
            .catch(function (err) {
                state.error = err.message;
                render();
            });
    }

    function syncProfiles() {
        state.error = '';
        api(serverPath('/srv-profiles/sync'), { method: 'POST', body: {} })
            .then(load)
            .catch(function (err) {
                state.error = err.message;
                render();
            });
    }

    function deleteRecord(id) {
        if (!confirm('Delete this DNS record?')) {
            return;
        }
        state.error = '';
        api(serverPath('/records/' + encodeURIComponent(id)), { method: 'DELETE' })
            .then(load)
            .catch(function (err) {
                state.error = err.message;
                render();
            });
    }

    function submitRecord() {
        var type = root.querySelector('#dns-type').value;
        var name = root.querySelector('#dns-name').value;
        var body = { type: type, name: name };

        if (type === 'SRV') {
            body.data = {
                service: root.querySelector('#dns-service').value,
                proto: root.querySelector('#dns-proto').value,
                target: root.querySelector('#dns-target').value,
                port: parseInt(root.querySelector('#dns-port').value, 10),
                priority: parseInt(root.querySelector('#dns-priority').value, 10),
                weight: parseInt(root.querySelector('#dns-weight').value, 10),
            };
        } else if (type === 'MX') {
            body.content = root.querySelector('#dns-content').value;
            body.priority = parseInt(root.querySelector('#dns-priority').value, 10);
        } else {
            body.content = root.querySelector('#dns-content').value;
        }

        state.error = '';
        api(serverPath('/records'), { method: 'POST', body: body })
            .then(function () {
                state.modal = null;
                return load();
            })
            .catch(function (err) {
                state.error = err.message;
                render();
            });
    }

    load();
};
