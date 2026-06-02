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
        showRecordForm: false,
        recordForm: { type: 'A', name: '' },
        submitting: false,
    };

    var STYLES =
        '<style>' +
        '.dns-plugin{color:#e5e7eb;font-size:14px;line-height:1.5;}' +
        '.dns-plugin h2{margin:0 0 1rem;font-size:1.25rem;font-weight:600;color:#f9fafb;}' +
        '.dns-plugin h3{margin:0 0 .75rem;font-size:1rem;font-weight:600;color:#f3f4f6;}' +
        '.dns-plugin p{margin:.25rem 0 .75rem;color:#9ca3af;}' +
        '.dns-plugin code{color:#d1d5db;background:#374151;padding:.1rem .35rem;border-radius:3px;font-size:.85em;}' +
        '.dns-plugin .dns-card{background:#27272a;border:1px solid #3f3f46;border-radius:6px;padding:1rem 1.25rem;margin-bottom:1.25rem;}' +
        '.dns-plugin .dns-form-panel{background:#18181b;border:1px solid #52525b;border-radius:6px;padding:1rem 1.25rem;margin:1rem 0;}' +
        '.dns-plugin .dns-form-panel h4{margin:0 0 1rem;font-size:.95rem;font-weight:600;color:#f9fafb;}' +
        '.dns-plugin .dns-field{margin-bottom:.75rem;}' +
        '.dns-plugin .dns-field label{display:block;margin-bottom:.25rem;font-size:.8rem;font-weight:500;color:#d1d5db;}' +
        '.dns-plugin .dns-field input,.dns-plugin .dns-field select{display:block;width:100%;max-width:360px;padding:.5rem .65rem;' +
        'background:#111827;border:1px solid #4b5563;border-radius:4px;color:#f9fafb;font-size:14px;}' +
        '.dns-plugin .dns-field input:focus,.dns-plugin .dns-field select:focus{outline:none;border-color:#3b82f6;box-shadow:0 0 0 2px rgba(59,130,246,.25);}' +
        '.dns-plugin .dns-actions{display:flex;flex-wrap:wrap;gap:.5rem;margin-top:.75rem;}' +
        '.dns-plugin .dns-btn{display:inline-flex;align-items:center;padding:.45rem .9rem;font-size:.875rem;font-weight:500;' +
        'border:none;border-radius:4px;cursor:pointer;color:#fff;background:#2563eb;}' +
        '.dns-plugin .dns-btn:hover{background:#1d4ed8;}' +
        '.dns-plugin .dns-btn:disabled{opacity:.55;cursor:not-allowed;}' +
        '.dns-plugin .dns-btn-secondary{background:#4b5563;color:#f9fafb;}' +
        '.dns-plugin .dns-btn-secondary:hover{background:#374151;}' +
        '.dns-plugin .dns-btn-danger{background:#b91c1c;}' +
        '.dns-plugin .dns-btn-danger:hover{background:#991b1b;}' +
        '.dns-plugin .dns-btn-sm{padding:.3rem .6rem;font-size:.8rem;}' +
        '.dns-plugin table{width:100%;border-collapse:collapse;margin-top:.75rem;}' +
        '.dns-plugin th,.dns-plugin td{border:1px solid #3f3f46;padding:.55rem .65rem;text-align:left;}' +
        '.dns-plugin th{background:#374151;color:#f9fafb;font-weight:600;font-size:.8rem;}' +
        '.dns-plugin td{background:#1f2937;color:#e5e7eb;}' +
        '.dns-plugin .dns-empty{color:#9ca3af;font-style:italic;}' +
        '.dns-plugin .dns-error{color:#fca5a5;background:#450a0a;border:1px solid #7f1d1d;border-radius:4px;padding:.5rem .75rem;margin-bottom:1rem;}' +
        '.dns-plugin .profile-row{display:flex;align-items:center;gap:.5rem;margin:.35rem 0;}' +
        '.dns-plugin .profile-row input[type=checkbox]{width:auto;max-width:none;accent-color:#2563eb;}' +
        '.dns-plugin .profile-row label{margin:0;color:#e5e7eb;cursor:pointer;}' +
        '</style>';

    function render() {
        root.innerHTML =
            '<div class="dns-plugin">' +
            STYLES +
            '<h2>DNS Records</h2>' +
            (state.error ? '<div class="dns-error" role="alert">' + escapeHtml(state.error) + '</div>' : '') +
            (state.loading ? '<p class="dns-empty">Loading…</p>' : renderContent()) +
            '</div>';

        bindEvents();
    }

    function renderContent() {
        return renderProfilesSection() + renderRecordsSection();
    }

    function renderProfilesSection() {
        if (!can('records.read')) {
            return '';
        }

        var html =
            '<div class="dns-card"><h3>SRV Profiles</h3>' +
            '<p>Enable game/service SRV records (Minecraft TCP, Factorio UDP, etc.) for this server.</p>';

        if (state.profiles.length === 0) {
            html +=
                '<p class="dns-empty">No SRV profiles configured. Add <code>srv_profiles</code> in Admin → Plugins → Settings.</p>';
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
                ' <code>' +
                escapeHtml(profile.service + profile.proto) +
                '</code></label></div>';
        });

        if (can('records.update') && state.profiles.length > 0) {
            html +=
                '<div class="dns-actions">' +
                '<button type="button" class="dns-btn" data-action="save-profiles">Save profiles</button>' +
                '<button type="button" class="dns-btn dns-btn-secondary" data-action="sync-profiles">Sync SRV records</button>' +
                '</div>';
        }

        return html + '</div>';
    }

    function renderRecordsSection() {
        var html = '<div class="dns-card"><h3>Records</h3>';

        if (can('records.create')) {
            html += '<div class="dns-actions">';
            if (!state.showRecordForm) {
                html +=
                    '<button type="button" class="dns-btn" data-action="toggle-record-form">Add record</button>';
            } else {
                html +=
                    '<button type="button" class="dns-btn dns-btn-secondary" data-action="toggle-record-form">Cancel</button>';
            }
            html += '</div>';
        }

        if (state.showRecordForm && can('records.create')) {
            html += renderRecordForm();
        }

        html += '<table><thead><tr><th>Type</th><th>Name</th><th>Details</th><th></th></tr></thead><tbody>';

        if (state.records.length === 0) {
            html += '<tr><td colspan="4" class="dns-empty">No records yet.</td></tr>';
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
                        '<button type="button" class="dns-btn dns-btn-danger dns-btn-sm" data-action="delete-record" data-id="' +
                        escapeHtml(record.cloudflare_id) +
                        '">Delete</button>';
                }

                html += '</td></tr>';
            });
        }

        return html + '</tbody></table></div>';
    }

    function renderRecordForm() {
        var f = state.recordForm;
        var type = f.type || 'A';

        return (
            '<div class="dns-form-panel" id="dns-record-form">' +
            '<h4>New DNS record</h4>' +
            '<div class="dns-field"><label for="dns-type">Type</label>' +
            '<select id="dns-type">' +
            ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV']
                .map(function (t) {
                    return '<option value="' + t + '"' + (type === t ? ' selected' : '') + '>' + t + '</option>';
                })
                .join('') +
            '</select></div>' +
            '<div class="dns-field"><label for="dns-name">Name</label>' +
            '<input id="dns-name" type="text" placeholder="subdomain or FQDN" value="' +
            escapeHtml(f.name || '') +
            '"></div>' +
            '<div id="dns-type-fields">' +
            renderTypeFields(type) +
            '</div>' +
            '<div class="dns-actions">' +
            '<button type="button" class="dns-btn" data-action="submit-record"' +
            (state.submitting ? ' disabled' : '') +
            '>' +
            (state.submitting ? 'Creating…' : 'Create record') +
            '</button>' +
            '<button type="button" class="dns-btn dns-btn-secondary" data-action="toggle-record-form">Cancel</button>' +
            '</div></div>'
        );
    }

    function renderTypeFields(type) {
        if (type === 'SRV') {
            return (
                '<div class="dns-field"><label for="dns-service">Service</label>' +
                '<input id="dns-service" type="text" placeholder="_minecraft" value="_minecraft"></div>' +
                '<div class="dns-field"><label for="dns-proto">Protocol</label>' +
                '<select id="dns-proto"><option value="_tcp">TCP (_tcp)</option><option value="_udp">UDP (_udp)</option></select></div>' +
                '<div class="dns-field"><label for="dns-target">Target</label>' +
                '<input id="dns-target" type="text" placeholder="host.example.com"></div>' +
                '<div class="dns-field"><label for="dns-port">Port</label>' +
                '<input id="dns-port" type="number" value="25565"></div>' +
                '<div class="dns-field"><label for="dns-priority">Priority</label>' +
                '<input id="dns-priority" type="number" value="0"></div>' +
                '<div class="dns-field"><label for="dns-weight">Weight</label>' +
                '<input id="dns-weight" type="number" value="5"></div>'
            );
        }
        if (type === 'MX') {
            return (
                '<div class="dns-field"><label for="dns-content">Mail server</label>' +
                '<input id="dns-content" type="text" placeholder="mail.example.com"></div>' +
                '<div class="dns-field"><label for="dns-priority">Priority</label>' +
                '<input id="dns-priority" type="number" value="10"></div>'
            );
        }
        return (
            '<div class="dns-field"><label for="dns-content">Content</label>' +
            '<input id="dns-content" type="text" placeholder="Record value"></div>'
        );
    }

    function bindEvents() {
        root.querySelectorAll('[data-action="save-profiles"]').forEach(function (btn) {
            btn.onclick = saveProfiles;
        });
        root.querySelectorAll('[data-action="sync-profiles"]').forEach(function (btn) {
            btn.onclick = syncProfiles;
        });
        root.querySelectorAll('[data-action="toggle-record-form"]').forEach(function (btn) {
            btn.onclick = function () {
                state.showRecordForm = !state.showRecordForm;
                if (state.showRecordForm) {
                    state.recordForm = { type: 'A', name: '' };
                }
                state.error = '';
                render();
            };
        });
        root.querySelectorAll('[data-action="delete-record"]').forEach(function (btn) {
            btn.onclick = function () {
                deleteRecord(btn.getAttribute('data-id'));
            };
        });
        root.querySelectorAll('[data-action="submit-record"]').forEach(function (btn) {
            btn.onclick = submitRecord;
        });

        var typeSelect = root.querySelector('#dns-type');
        if (typeSelect) {
            typeSelect.onchange = function () {
                state.recordForm.type = typeSelect.value;
                render();
            };
        }

        var nameInput = root.querySelector('#dns-name');
        if (nameInput) {
            nameInput.oninput = function () {
                state.recordForm.name = nameInput.value;
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
        var typeEl = root.querySelector('#dns-type');
        var nameEl = root.querySelector('#dns-name');
        if (!typeEl || !nameEl) {
            return;
        }

        var type = typeEl.value;
        var name = nameEl.value.trim();
        if (!name) {
            state.error = 'Name is required.';
            render();
            return;
        }

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
        state.submitting = true;
        render();

        api(serverPath('/records'), { method: 'POST', body: body })
            .then(function () {
                state.showRecordForm = false;
                state.recordForm = { type: 'A', name: '' };
                state.submitting = false;
                return load();
            })
            .catch(function (err) {
                state.submitting = false;
                state.error = err.message;
                render();
            });
    }

    load();
};
