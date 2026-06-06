window.PterodactylPlugin_com_prestonhager_dns = function () {
    'use strict';

    var PLUGIN_ID = 'com.prestonhager.dns';
    var ctx = window.__PterodactylPluginContext;
    var rootId = (ctx && ctx.rootId) || ('plugin-root-' + PLUGIN_ID.replace(/\./g, '-'));
    var root = document.getElementById(rootId);

    if (!ctx || !root) {
        return;
    }

    function perms() {
        return ctx.getPermissions() || [];
    }

    function can(permission) {
        if (ctx.hasFullAccess && ctx.hasFullAccess()) {
            return true;
        }
        var p = perms();
        return p.indexOf('*') !== -1 || p.indexOf(permission) !== -1;
    }

    function csrfToken() {
        if (ctx.csrfToken) {
            return ctx.csrfToken;
        }
        var meta =
            document.querySelector('meta[name="csrf-token"]') ||
            document.querySelector('meta[name="_token"]');
        return meta ? meta.getAttribute('content') || '' : '';
    }

    function api(path, options) {
        options = options || {};
        var url = ctx.apiBase + path;
        var headers = {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
        };
        var token = csrfToken();
        if (token) {
            headers['X-CSRF-TOKEN'] = token;
        }
        return fetch(url, {
            credentials: 'same-origin',
            method: options.method || 'GET',
            headers: headers,
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

    function pluginClass() {
        if (ctx.getRootClass && typeof ctx.getRootClass === 'function') {
            return ctx.getRootClass();
        }
        return 'ptero-plugin';
    }

    function copyText(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text);
            return;
        }
        var ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
    }

    var state = {
        subdomain: null,
        profiles: [],
        enabled: [],
        customDomain: null,
        nameserver: null,
        loading: true,
        error: '',
        labelDraft: '',
        domainDraft: 'default',
        checkResult: null,
        customDomainDraft: '',
        nameserverDraft: '',
        submitting: false,
    };

    function render() {
        root.innerHTML =
            '<div class="' +
            pluginClass() +
            '">' +
            '<h2>DNS</h2>' +
            (state.error
                ? '<div class="ptero-alert ptero-alert--danger" role="alert">' + escapeHtml(state.error) + '</div>'
                : '') +
            (state.loading ? '<p class="ptero-muted">Loading…</p>' : renderContent()) +
            '</div>';
    }

    function renderContent() {
        return (
            renderConnectionCard() +
            renderHostnameSection() +
            renderProfilesSection() +
            renderCustomDomainSection() +
            renderNameserverSection()
        );
    }

    function renderConnectionCard() {
        var sub = state.subdomain || {};
        var conn = sub.connection || {};
        var host = conn.host || sub.fqdn || '—';
        var port = conn.port || '—';
        var address = conn.address || host + ':' + port;

        return (
            '<div class="ptero-plugin-box"><h3>Connection</h3>' +
            '<p class="ptero-muted">Use this hostname and port in your game client. DNS does not hide your server IP.</p>' +
            '<div class="ptero-field"><label class="ptero-label">Hostname</label>' +
            '<div class="ptero-plugin-actions"><code>' +
            escapeHtml(host) +
            '</code> <button type="button" class="ptero-btn ptero-btn--secondary ptero-btn--sm" data-action="copy-host">Copy</button></div></div>' +
            '<div class="ptero-field"><label class="ptero-label">Address</label>' +
            '<div class="ptero-plugin-actions"><code>' +
            escapeHtml(address) +
            '</code> <button type="button" class="ptero-btn ptero-btn--secondary ptero-btn--sm" data-action="copy-address">Copy</button></div></div>' +
            '<p class="ptero-hint">Mode: <strong>' +
            escapeHtml(sub.hostname_mode || 'auto') +
            '</strong></p></div>'
        );
    }

    function renderHostnameSection() {
        var sub = state.subdomain || {};
        var policy = sub.policy || {};
        var canEdit = can('subdomain.update') && policy.can_update && !sub.subdomain_locked;

        var html =
            '<div class="ptero-plugin-box"><h3>Hostname</h3>' +
            '<p>Current: <code>' +
            escapeHtml(sub.fqdn || '') +
            '</code></p>';

        if (sub.subdomain_locked) {
            html += '<p class="ptero-muted">This hostname is locked by an administrator.</p>';
        } else if (!can('subdomain.update')) {
            html += '<p class="ptero-muted">You do not have permission to change the hostname.</p>';
        } else if (!policy.can_update) {
            html +=
                '<p class="ptero-muted">Hostname changes are not available (policy: ' +
                escapeHtml(policy.policy || 'never') +
                ').</p>';
        }

        if (canEdit) {
            html +=
                '<div class="ptero-field"><label class="ptero-label" for="dns-label">Vanity label</label>' +
                '<input class="ptero-input" id="dns-label" type="text" value="' +
                escapeHtml(state.labelDraft || sub.hostname_label || '') +
                '"></div>';

            if ((sub.primary_domains || []).length > 1) {
                html += '<div class="ptero-field"><label class="ptero-label" for="dns-domain">Primary domain</label><select class="ptero-select" id="dns-domain">';
                (sub.primary_domains || []).forEach(function (d) {
                    var selected = (state.domainDraft || sub.primary_domain) === d.id ? ' selected' : '';
                    html +=
                        '<option value="' +
                        escapeHtml(d.id) +
                        '"' +
                        selected +
                        '>' +
                        escapeHtml(d.domain) +
                        '</option>';
                });
                html += '</select></div>';
            }

            html +=
                '<div class="ptero-plugin-actions">' +
                '<button type="button" class="ptero-btn ptero-btn--secondary" data-action="check-label">Check availability</button>' +
                '<button type="button" class="ptero-btn ptero-btn--primary" data-action="save-label"' +
                (state.submitting ? ' disabled' : '') +
                '>Save hostname</button></div>';

            if (state.checkResult) {
                html +=
                    '<p class="ptero-hint">' +
                    (state.checkResult.available
                        ? '✓ Available: ' + escapeHtml(state.checkResult.fqdn)
                        : '✗ Not available: ' + escapeHtml(state.checkResult.fqdn)) +
                    '</p>';
            }

            if (policy.changes_remaining != null) {
                html +=
                    '<p class="ptero-hint">Changes remaining this period: ' +
                    escapeHtml(String(policy.changes_remaining)) +
                    '</p>';
            }
        }

        return html + '</div>';
    }

    function renderProfilesSection() {
        if (!can('subdomain.read')) {
            return '';
        }

        var html =
            '<div class="ptero-plugin-box"><h3>SRV Profiles</h3>' +
            '<p>Enable game/service SRV records for this server, then sync to Cloudflare.</p>';

        if (state.profiles.length === 0) {
            html += '<p class="ptero-muted">No SRV profiles configured by the host.</p>';
        }

        state.profiles.forEach(function (profile) {
            var checked = state.enabled.indexOf(profile.id) !== -1 ? ' checked' : '';
            var disabled = can('subdomain.update') ? '' : ' disabled';
            html +=
                '<div class="ptero-profile-row">' +
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

        if (can('subdomain.update') && state.profiles.length > 0) {
            html +=
                '<div class="ptero-plugin-actions">' +
                '<button type="button" class="ptero-btn ptero-btn--primary" data-action="save-profiles">Save profiles</button>' +
                '<button type="button" class="ptero-btn ptero-btn--secondary" data-action="sync-profiles">Sync SRV records</button>' +
                '</div>';
        }

        return html + '</div>';
    }

    function renderCustomDomainSection() {
        var sub = state.subdomain || {};
        if (!sub.custom_domain_enabled) {
            return '';
        }

        var cd = state.customDomain || {};
        var verification = cd.verification || null;
        var html =
            '<div class="ptero-plugin-box"><h3>Custom domain</h3>' +
            '<p>Point your own domain via CNAME or TXT verification.</p>';

        if (cd.custom_domain) {
            html +=
                '<p>Domain: <code>' +
                escapeHtml(cd.custom_domain) +
                '</code> — status: <strong>' +
                escapeHtml(cd.custom_domain_status || 'none') +
                '</strong></p>';
        }

        if (verification) {
            html +=
                '<p class="ptero-hint">Add one of:</p><ul>' +
                '<li>TXT <code>' +
                escapeHtml(verification.txt_host) +
                '</code> = <code>' +
                escapeHtml(verification.txt_value) +
                '</code></li>' +
                '<li>CNAME <code>' +
                escapeHtml(verification.cname_host) +
                '</code> → <code>' +
                escapeHtml(verification.cname_target) +
                '</code></li></ul>';
        }

        if (can('subdomain.update')) {
            html +=
                '<div class="ptero-field"><label class="ptero-label" for="dns-custom-domain">Custom domain</label>' +
                '<input class="ptero-input" id="dns-custom-domain" type="text" placeholder="play.example.com" value="' +
                escapeHtml(state.customDomainDraft) +
                '"></div>' +
                '<div class="ptero-plugin-actions">' +
                '<button type="button" class="ptero-btn ptero-btn--primary" data-action="save-custom-domain">Request verification</button>';

            if (cd.custom_domain_status === 'pending') {
                html +=
                    '<button type="button" class="ptero-btn ptero-btn--secondary" data-action="verify-custom-domain">Verify DNS</button>';
            }

            html += '</div>';
        }

        return html + '</div>';
    }

    function renderNameserverSection() {
        var sub = state.subdomain || {};
        if (!sub.nameserver_delegation_enabled) {
            return '';
        }

        var ns = state.nameserver || {};
        var html =
            '<div class="ptero-plugin-box"><h3>Nameserver delegation</h3>' +
            '<p>Delegate your domain to host nameservers (requires admin approval).</p>';

        if (ns.nameserver_domain) {
            html +=
                '<p>Domain: <code>' +
                escapeHtml(ns.nameserver_domain) +
                '</code> — status: <strong>' +
                escapeHtml(ns.nameserver_status || 'none') +
                '</strong></p>';
        }

        if ((ns.nameservers || []).length > 0) {
            html += '<ul>';
            ns.nameservers.forEach(function (n) {
                html += '<li><code>' + escapeHtml(n) + '</code></li>';
            });
            html += '</ul>';
        }

        if (can('subdomain.update')) {
            html +=
                '<div class="ptero-field"><label class="ptero-label" for="dns-nameserver-domain">Your domain</label>' +
                '<input class="ptero-input" id="dns-nameserver-domain" type="text" placeholder="example.com" value="' +
                escapeHtml(state.nameserverDraft) +
                '"></div>' +
                '<div class="ptero-plugin-actions">' +
                '<button type="button" class="ptero-btn ptero-btn--primary" data-action="save-nameserver">Request delegation</button>';

            if (ns.nameserver_status === 'active') {
                html +=
                    '<button type="button" class="ptero-btn ptero-btn--secondary" data-action="verify-nameserver">Verify zone</button>';
            }

            html += '</div>';
        }

        return html + '</div>';
    }

    function handleClick(event) {
        var target = event.target;
        if (!target || !root.contains(target)) {
            return;
        }
        var actionEl = target.closest('[data-action]');
        if (!actionEl || !root.contains(actionEl)) {
            return;
        }
        var action = actionEl.getAttribute('data-action');

        if (action === 'copy-host') {
            copyText((state.subdomain && state.subdomain.connection && state.subdomain.connection.host) || '');
            return;
        }
        if (action === 'copy-address') {
            copyText((state.subdomain && state.subdomain.connection && state.subdomain.connection.address) || '');
            return;
        }
        if (action === 'check-label') {
            checkLabel();
            return;
        }
        if (action === 'save-label') {
            saveLabel();
            return;
        }
        if (action === 'save-profiles') {
            saveProfiles();
            return;
        }
        if (action === 'sync-profiles') {
            syncProfiles();
            return;
        }
        if (action === 'save-custom-domain') {
            saveCustomDomain();
            return;
        }
        if (action === 'verify-custom-domain') {
            verifyCustomDomain();
            return;
        }
        if (action === 'save-nameserver') {
            saveNameserver();
            return;
        }
        if (action === 'verify-nameserver') {
            verifyNameserver();
        }
    }

    function handleInput(event) {
        var target = event.target;
        if (!target || !root.contains(target)) {
            return;
        }
        if (target.id === 'dns-label') {
            state.labelDraft = target.value;
        }
        if (target.id === 'dns-domain') {
            state.domainDraft = target.value;
        }
        if (target.id === 'dns-custom-domain') {
            state.customDomainDraft = target.value;
        }
        if (target.id === 'dns-nameserver-domain') {
            state.nameserverDraft = target.value;
        }
    }

    function bindRootEvents() {
        if (root.dataset.pteroEventsBound === 'true') {
            return;
        }
        root.dataset.pteroEventsBound = 'true';
        root.addEventListener('click', handleClick);
        root.addEventListener('input', handleInput);
        root.addEventListener('change', handleInput);
    }

    function load() {
        state.loading = true;
        state.error = '';
        render();

        Promise.all([
            api(serverPath('/subdomain')),
            api(serverPath('/srv-profiles')),
        ])
            .then(function (baseResults) {
                state.subdomain = baseResults[0].attributes || {};
                state.profiles = (baseResults[1].attributes && baseResults[1].attributes.profiles) || [];
                state.enabled = (baseResults[1].attributes && baseResults[1].attributes.enabled) || [];
                state.labelDraft = state.subdomain.hostname_label || '';
                state.domainDraft = state.subdomain.primary_domain || 'default';

                var extra = [];
                if (state.subdomain.custom_domain_enabled) {
                    extra.push(api(serverPath('/custom-domain')).catch(function () { return null; }));
                }
                if (state.subdomain.nameserver_delegation_enabled) {
                    extra.push(api(serverPath('/nameserver')).catch(function () { return null; }));
                }
                return Promise.all(extra);
            })
            .then(function (extraResults) {
                var idx = 0;
                if (state.subdomain.custom_domain_enabled) {
                    var cd = extraResults[idx++];
                    state.customDomain = cd && cd.attributes ? cd.attributes : null;
                }
                if (state.subdomain.nameserver_delegation_enabled) {
                    var ns = extraResults[idx++];
                    state.nameserver = ns && ns.attributes ? ns.attributes : null;
                }
                state.loading = false;
                render();
            })
            .catch(function (err) {
                state.loading = false;
                state.error = err.message || String(err);
                render();
            });
    }

    function checkLabel() {
        var labelEl = root.querySelector('#dns-label');
        var domainEl = root.querySelector('#dns-domain');
        var label = labelEl ? labelEl.value.trim() : state.labelDraft;
        var domain = domainEl ? domainEl.value : state.domainDraft;
        if (!label) {
            state.error = 'Enter a label to check.';
            render();
            return;
        }
        state.error = '';
        api(serverPath('/subdomain/check?label=' + encodeURIComponent(label) + '&domain=' + encodeURIComponent(domain)))
            .then(function (res) {
                state.checkResult = res.attributes || null;
                render();
            })
            .catch(function (err) {
                state.error = err.message;
                render();
            });
    }

    function saveLabel() {
        var labelEl = root.querySelector('#dns-label');
        var domainEl = root.querySelector('#dns-domain');
        var label = labelEl ? labelEl.value.trim() : state.labelDraft;
        var domain = domainEl ? domainEl.value : state.domainDraft;
        if (!label) {
            state.error = 'Label is required.';
            render();
            return;
        }
        state.submitting = true;
        state.error = '';
        render();
        api(serverPath('/subdomain'), { method: 'PUT', body: { label: label, primary_domain: domain } })
            .then(function () {
                state.submitting = false;
                state.checkResult = null;
                return load();
            })
            .catch(function (err) {
                state.submitting = false;
                state.error = err.message;
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

    function saveCustomDomain() {
        var el = root.querySelector('#dns-custom-domain');
        var domain = el ? el.value.trim() : state.customDomainDraft;
        if (!domain) {
            state.error = 'Enter a custom domain.';
            render();
            return;
        }
        state.error = '';
        api(serverPath('/custom-domain'), { method: 'PUT', body: { domain: domain } })
            .then(load)
            .catch(function (err) {
                state.error = err.message;
                render();
            });
    }

    function verifyCustomDomain() {
        state.error = '';
        api(serverPath('/custom-domain/verify'), { method: 'POST', body: {} })
            .then(load)
            .catch(function (err) {
                state.error = err.message;
                render();
            });
    }

    function saveNameserver() {
        var el = root.querySelector('#dns-nameserver-domain');
        var domain = el ? el.value.trim() : state.nameserverDraft;
        if (!domain) {
            state.error = 'Enter a domain for nameserver delegation.';
            render();
            return;
        }
        state.error = '';
        api(serverPath('/nameserver'), { method: 'PUT', body: { domain: domain } })
            .then(load)
            .catch(function (err) {
                state.error = err.message;
                render();
            });
    }

    function verifyNameserver() {
        state.error = '';
        api(serverPath('/nameserver/verify'), { method: 'POST', body: {} })
            .then(load)
            .catch(function (err) {
                state.error = err.message;
                render();
            });
    }

    bindRootEvents();
    load();
};
