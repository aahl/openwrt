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
		'padding:14px 20px 10px;text-align:center;box-shadow:0 2px 8px rgba(30,40,60,.08);min-width:180px;' +
		'cursor:pointer;transition:border-color .15s}' +
	'.mt-card:hover{border-color:#9fc3e8}' +
	'.mt-card .mt-badge{position:absolute;top:-10px;right:-10px;min-width:24px;height:24px;border-radius:50%;' +
		'background:#2f81f7;color:#fff;font-size:13px;line-height:24px;font-weight:600}' +
	'.mt-name{font-size:14px;font-weight:600;margin-top:4px;max-width:200px;overflow:hidden;' +
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
	'.mt-cap.self{background:#e8f0fe;border-color:#bcd2f5;color:#1a56c4}' +
	'.mt-row{display:flex;justify-content:space-between;width:min(560px,92%);gap:24px}' +
	'.mt-row .mt-card{flex:1}' +
	'.mt-offline{opacity:.45}' +
	'.mt-detail{width:min(560px,92%);margin:2px auto 0;background:#fff;border:1px solid #e3e8ee;' +
		'border-radius:10px;padding:10px 14px;box-shadow:0 2px 8px rgba(30,40,60,.08)}' +
	'.mt-dtitle{font-size:13px;font-weight:600;border-bottom:1px dashed #e3e8ee;padding-bottom:6px;margin-bottom:4px}' +
	'.mt-drow{display:flex;justify-content:space-between;font-size:12px;padding:3px 0}' +
	'.mt-drow .mt-sig{color:#8a94a3}' +
	'.mt-others{margin-top:12px;font-size:12px;color:#8a94a3;cursor:pointer;text-decoration:underline dotted}' +
	'.mt-hint{font-size:12px;color:#8a94a3;margin-top:14px;text-align:center}';

return view.extend({
	handleSaveApply: null,
	handleSave: null,
	handleReset: null,

	openNode: null,

	scan: function() {
		return fs.exec('/usr/bin/meshtopo-scan').then(function(res) {
			try {
				return (res && res.stdout) ? JSON.parse(res.stdout) : null;
			} catch (e) {
				return null;
			}
		}).catch(function() {
			return null;
		});
	},

	badgeText: function(clients) {
		return (clients == null || isNaN(clients)) ? '?' : String(clients);
	},

	sigText: function(c) {
		return c.signal ? ('%sdBm'.format(c.signal)) : '有线/未知';
	},

	nodeCapClass: function(n) {
		if (n.link == 'self')
			return 'mt-cap self';
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

	nodeCapText: function(n) {
		if (n.link == 'self')
			return _('本机');
		if (n.link == 'mesh')
			return _('无线 · 802.11s') + (n.signal ? (' · %sdBm').format(n.signal) : '');
		if (n.link == 'wire')
			return _('有线回程');
		return _('离线');
	},

	buildDetail: function(title, list) {
		var self = this;

		var rows = (list || []).map(function(c) {
			var label = c.ip ? '%s（%s）'.format(c.name || c.ip, c.ip) : (c.name || c.ip);

			return E('div', { 'class': 'mt-drow' }, [
				E('span', {}, label),
				E('span', { 'class': 'mt-sig' }, self.sigText(c))
			]);
		});

		if (!rows.length)
			rows = [ E('div', { 'class': 'mt-drow' }, E('span', {}, _('暂无在线客户端'))) ];

		return E('div', { 'class': 'mt-detail' }, [ E('div', { 'class': 'mt-dtitle' }, title) ].concat(rows));
	},

	renderTree: function(d) {
		var self = this;

		var wrap = E('div', { 'class': 'mt-wrap' });

		/* 互联网 */
		if (d.internet !== false)
			wrap.appendChild(E('div', {}, svgGlobe));
		else
			wrap.appendChild(E('div', { 'style': 'opacity:.45' }, svgGlobe));

		wrap.appendChild(E('div', { 'class': 'mt-vline' }));

		/* 主路由 */
		var mainName = d.main.name || d.main.ip;
		if (mainName.indexOf('主路由') < 0)
			mainName += '（主路由）';

		var mainCard = E('div', { 'class': 'mt-card' + (!d.main.online ? ' mt-offline' : '') }, [
			E('div', { 'class': 'mt-badge' }, self.badgeText(d.main.clients)),
			E('div', {}, svgRouter),
			E('div', { 'class': 'mt-name' }, mainName),
			E('div', { 'class': 'mt-ip' }, d.main.ip)
		]);
		mainCard.addEventListener('click', function(ev) {
			ev.stopPropagation();
			self.openNode = (self.openNode == 'main') ? null : 'main';
			self.renderTreeRefresh(d);
		});
		wrap.appendChild(mainCard);
		wrap.appendChild(E('div', { 'class': 'mt-vline' }));

		/* 连接件 + 子节点行 */
		var conn = E('div', { 'class': 'mt-connect' }, [
			E('div', { 'class': 'mt-cstub' }),
			E('div', { 'class': 'mt-hbar' })
		]);

		var row = E('div', { 'class': 'mt-row' });

		(d.nodes || []).forEach(function(n, i) {
			conn.appendChild(E('div', { 'class': 'mt-stub', 'style': 'left:%d%%'.format(i == 0 ? 25 : 75) },
				E('div', { 'class': self.nodeCapClass(n) }, self.nodeCapText(n))));

			var card = E('div', { 'class': 'mt-card' + (n.link == 'down' ? ' mt-offline' : '') }, [
				E('div', { 'class': 'mt-badge' }, self.badgeText(n.clients)),
				E('div', {}, svgRouter),
				E('div', { 'class': 'mt-name' }, n.label || n.ip),
				E('div', { 'class': 'mt-ip' }, n.ip)
			]);
			card.addEventListener('click', function(ev) {
				ev.stopPropagation();
				self.openNode = (self.openNode == n.ip) ? null : n.ip;
				self.renderTreeRefresh(d);
			});
			row.appendChild(card);
		});

		wrap.appendChild(conn);
		wrap.appendChild(row);

		/* 明细面板 */
		if (self.openNode != null) {
			var title, list;

			if (self.openNode == 'main') {
				title = '%s · 在线终端 %s 台'.format(mainName, self.badgeText(d.main.clients));
				list = d.main.detail;
			} else {
				var nd = (d.nodes || []).filter(function(n) { return n.ip == self.openNode; })[0];
				if (nd) {
					title = '%s（%s）· 在线终端 %s 台'.format(nd.label || nd.ip, nd.ip, self.badgeText(nd.clients));
					list = nd.detail;
				} else if (self.openNode == 'others') {
					title = _('有线 / 未识别设备');
					list = d.others;
				}
			}

			if (title)
				wrap.appendChild(self.buildDetail(title, list));
		}

		/* 有线/未识别入口 */
		var othersCount = (d.others || []).length;
		if (othersCount > 0) {
			var others = E('div', { 'class': 'mt-others' },
				_('有线 / 未识别设备 %d 台（点击查看）').format(othersCount));
			others.addEventListener('click', function(ev) {
				ev.stopPropagation();
				self.openNode = (self.openNode == 'others') ? null : 'others';
				self.renderTreeRefresh(d);
			});
			wrap.appendChild(others);
		}

		/* 提示 */
		var hints = [];

		if (d.internet === false)
			hints.push(_('外网未连接'));

		if (self.openNode == null)
			hints.push(_('点击卡片可查看该节点下的客户端明细'));

		wrap.appendChild(E('div', { 'class': 'mt-hint' }, hints.join(' · ')));

		return wrap;
	},

	renderTreeRefresh: function(d) {
		var host = document.getElementById('meshtopo-wrap');

		while (host && host.firstChild)
			host.removeChild(host.firstChild);

		if (d && host)
			host.appendChild(this.renderTree(d));
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
				_('以主路由为根的实时组网状态，每 5 秒刷新；点击卡片查看客户端明细，胶囊标注回程方式与信号')),
			E('div', { 'id': 'meshtopo-wrap' })
		]);

		var host = container.lastElementChild;

		if (data)
			host.appendChild(this.renderTree(data));

		poll.add(function() {
			return self.scan().then(function(d) {
				self.renderTreeRefresh(d);
			});
		}, 5);

		return E('div', {}, [ style, container ]);
	}
});
