'use strict';
'require view';
'require fs';
'require poll';

var svgGlobe = '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">' +
	'<defs><linearGradient id="mtgl" x1="0" y1="0" x2="0" y2="1">' +
	'<stop offset="0" stop-color="#bfe3ff"/><stop offset="1" stop-color="#63a8f0"/></linearGradient></defs>' +
	'<circle cx="32" cy="32" r="30" fill="url(#mtgl)"/>' +
	'<circle cx="32" cy="32" r="22" fill="none" stroke="#fff" stroke-width="1.6"/>' +
	'<ellipse cx="32" cy="32" rx="10" ry="22" fill="none" stroke="#fff" stroke-width="1.4"/>' +
	'<path d="M10 32h44M14 22h36M14 42h36" stroke="#fff" stroke-width="1.3" fill="none"/></svg>';

var svgRouter = '<svg xmlns="http://www.w3.org/2000/svg" width="72" height="52" viewBox="0 0 72 52">' +
	'<g stroke="#5a6a7a" stroke-width="2.4" stroke-linecap="round" fill="none">' +
	'<path d="M22 20 L16 6"/><path d="M31 17 L29 3"/><path d="M41 17 L43 3"/><path d="M50 20 L56 6"/></g>' +
	'<rect x="12" y="21" width="48" height="18" rx="5" fill="#48586a"/>' +
	'<circle cx="22" cy="30" r="2.4" fill="#7ee37e"/>' +
	'<circle cx="31" cy="30" r="2.4" fill="#7ee37e"/>' +
	'<rect x="40" y="26" width="16" height="8" rx="2" fill="#33414f"/></svg>';

var css = '' +
	'.mt-wrap{display:flex;flex-direction:column;align-items:center}' +
	'.mt-vline{width:2px;height:24px;background:#cfd6e0;margin:2px 0}' +
	'.mt-card{position:relative;background:#fff;border:1px solid #e3e8ee;border-radius:12px;' +
		'padding:14px 20px 10px;text-align:center;box-shadow:0 2px 8px rgba(30,40,60,.08);min-width:180px}' +
	'.mt-card .mt-badge{position:absolute;top:-10px;right:-10px;min-width:24px;height:24px;border-radius:50%;' +
		'background:#2f81f7;color:#fff;font-size:13px;line-height:24px;font-weight:600}' +
	'.mt-name{font-size:14px;font-weight:600;margin-top:4px;max-width:180px;overflow:hidden;' +
		'text-overflow:ellipsis;white-space:nowrap}' +
	'.mt-ip{font-size:12px;color:#8a94a3;margin-top:2px}' +
	'.mt-connect{position:relative;width:min(560px,92%);height:58px}' +
	'.mt-cstub{position:absolute;left:50%;top:0;width:2px;height:14px;background:#cfd6e0;transform:translateX(-1px)}' +
	'.mt-hbar{position:absolute;left:25%;width:50%;top:14px;height:2px;background:#cfd6e0}' +
	'.mt-stub{position:absolute;top:14px;width:2px;height:44px;background:#cfd6e0}' +
	'.mt-cap{position:absolute;top:60%;left:50%;transform:translate(-50%,-50%);white-space:nowrap;font-size:12px;' +
		'padding:2px 10px;border-radius:999px;background:#eef3fb;border:1px solid #d5e1f0;color:#44536a}' +
	'.mt-cap.good{background:#e8f7ec;border-color:#bfe6c8;color:#256b34}' +
	'.mt-cap.mid{background:#fdf6e3;border-color:#f0e0b0;color:#8a6d1a}' +
	'.mt-cap.bad{background:#fdeceb;border-color:#f0c8c5;color:#9c2b26}' +
	'.mt-cap.wire{background:#e8f7ec;border-color:#bfe6c8;color:#256b34}' +
	'.mt-row{display:flex;justify-content:space-between;width:min(560px,92%);gap:24px}' +
	'.mt-row .mt-card{flex:1}' +
	'.mt-offline{opacity:.45}' +
	'.mt-hint{font-size:12px;color:#8a94a3;margin-top:14px}';

return view.extend({
	handleSaveApply: null,
	handleSave: null,
	handleReset: null,

	scan: function() {
		return fs.exec('/usr/bin/meshtopo-scan').then(function(res) {
			return (res && res.stdout) ? JSON.parse(res.stdout) : null;
		}).catch(function() {
			return null;
		});
	},

	sigClass: function(n) {
		if (n.link == 'wire')
			return 'mt-cap wire';

		var sig = parseInt(n.signal, 10);

		if (isNaN(sig))
			return 'mt-cap bad';

		if (sig >= -60)
			return 'mt-cap good';
		else if (sig >= -72)
			return 'mt-cap mid';
		else
			return 'mt-cap bad';
	},

	capText: function(n) {
		if (n.link == 'mesh')
			return _('无线 · 802.11s') + (n.signal ? (' · %sdBm').format(n.signal) : '');
		if (n.link == 'wire')
			return _('有线回程');
		return _('离线');
	},

	badgeText: function(clients) {
		return (clients == null || isNaN(clients)) ? '?' : String(clients);
	},

	buildCard: function(name, ip, badge, offline) {
		return E('div', { 'class': 'mt-card' + (offline ? ' mt-offline' : '') }, [
			E('div', { 'class': 'mt-badge' }, badge),
			E('div', {}, svgRouter),
			E('div', { 'class': 'mt-name' }, name),
			E('div', { 'class': 'mt-ip' }, ip)
		]);
	},

	renderTree: function(d) {
		var self = this;

		var wrap = E('div', { 'class': 'mt-wrap' });

		/* 互联网节点 */
		wrap.appendChild(E('div', {}, svgGlobe));
		wrap.appendChild(E('div', { 'class': 'mt-vline' }));

		/* 主路由 */
		wrap.appendChild(this.buildCard(
			(d.role == 'main') ? '%s（主路由）'.format(d.self.name) : d.self.name,
			d.self.ip,
			this.badgeText(d.self.clients),
			false));
		wrap.appendChild(E('div', { 'class': 'mt-vline' }));

		/* 连接件 + 节点行 */
		var conn = E('div', { 'class': 'mt-connect' }, [
			E('div', { 'class': 'mt-cstub' }),
			E('div', { 'class': 'mt-hbar' })
		]);

		var row = E('div', { 'class': 'mt-row' });

		(d.nodes || []).forEach(function(n, i) {
			conn.appendChild(E('div', { 'class': 'mt-stub', 'style': 'left:%d%%'.format(i == 0 ? 25 : 75) },
				E('div', { 'class': self.sigClass(n) }, self.capText(n))));

			row.appendChild(self.buildCard(
				n.label || n.ip, n.ip,
				self.badgeText(n.clients),
				n.link == 'down'));
		});

		wrap.appendChild(conn);
		wrap.appendChild(row);

		/* 说明 */
		var hints = [];

		if (!d.internet)
			hints.push(_('外网未连接'));

		if ((d.nodes || []).some(function(n) { return n.clients == null; }))
			hints.push(_('节点终端数依赖 usteer 同步，若持续显示 ? 请确认三台的 usteer 服务已运行'));

		wrap.appendChild(E('div', { 'class': 'mt-hint' }, hints.join(' · ')));

		return wrap;
	},

	load: function() {
		return this.scan();
	},

	render: function(data) {
		var self = this;

		var style = E('style', { 'type': 'text/css' }, css);

		var container = E('div', { 'class': 'cbi-map' }, [
			E('h2', {}, _('Mesh 组网拓扑')),
			E('div', { 'class': 'cbi-map-descr' },
				_('互联网 → 主路由 → 各房间的实时组网状态，每 5 秒刷新；胶囊标注回程方式与信号强度')),
			E('div', { 'id': 'meshtopo-wrap' })
		]);

		var host = container.lastElementChild;

		if (data)
			host.appendChild(this.renderTree(data));

		poll.add(function() {
			return self.scan().then(function(d) {
				while (host.firstChild)
					host.removeChild(host.firstChild);

				if (d)
					host.appendChild(self.renderTree(d));
			});
		}, 5);

		return E('div', {}, [ style, container ]);
	}
});
