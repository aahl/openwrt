'use strict';
'require view';
'require form';
'require fs';
'require poll';

return view.extend({
	/* 保存并应用后立即重启服务（procd 的 uci 触发器亦会自动重载，此处为双保险） */
	handleSaveApply: function(ev, mode) {
		return this.super('handleSaveApply', [ev, mode]).then(function() {
			return fs.exec('/etc/init.d/nf_deaf', ['restart']).catch(function() {});
		});
	},

	load: function() {
		return L.resolveDefault(fs.exec('/etc/init.d/nf_deaf', ['status']), null);
	},

	parseStatus: function(res) {
		var st = { module: '', target: '', domain: '', running: '0', packets: '0' };

		if (res && res.stdout) {
			res.stdout.trim().split('\n').forEach(function(line) {
				var i = line.indexOf('=');

				if (i > 0 && st.hasOwnProperty(line.substring(0, i)))
					st[line.substring(0, i)] = line.substring(i + 1);
			});
		}

		return st;
	},

	fmtRunning: function(st) {
		if (st.running === '1')
			return _('已启用（伪造规则已生效）');
		if (st.module === 'loaded')
			return _('已关闭');
		return _('未运行');
	},

	fmtModule: function(st) {
		if (st.module === 'loaded')
			return _('已加载');
		return _('未加载（固件需包含 kmod-nf-deaf）');
	},

	buildStatusNode: function(st) {
		return E('div', { 'class': 'cbi-map' }, [
			E('h2', {}, _('当前状态')),
			E('div', { 'class': 'cbi-map-descr' },
				_('内核中 nf_deaf 的实时状态，每 5 秒自动刷新')),
			E('table', { 'class': 'table' }, [
				E('tr', { 'class': 'tr table-titles' }, [
					E('th', { 'class': 'th', 'style': 'width:33%' }, _('项目')),
					E('th', { 'class': 'th' }, _('状态'))
				]),
				E('tr', { 'class': 'tr' }, [
					E('td', { 'class': 'td' }, _('运行状态')),
					E('td', { 'class': 'td', 'id': 'nf-deaf-running' }, this.fmtRunning(st))
				]),
				E('tr', { 'class': 'tr' }, [
					E('td', { 'class': 'td' }, _('内核模块')),
					E('td', { 'class': 'td', 'id': 'nf-deaf-module' }, this.fmtModule(st))
				]),
				E('tr', { 'class': 'tr' }, [
					E('td', { 'class': 'td' }, _('伪造域名')),
					E('td', { 'class': 'td', 'id': 'nf-deaf-domain' }, st.domain || '-')
				]),
				E('tr', { 'class': 'tr' }, [
					E('td', { 'class': 'td' }, _('伪造目标')),
					E('td', { 'class': 'td', 'id': 'nf-deaf-target' }, st.target || '-')
				]),
				E('tr', { 'class': 'tr' }, [
					E('td', { 'class': 'td' }, _('已触发伪造的报文数')),
					E('td', { 'class': 'td', 'id': 'nf-deaf-packets' }, st.packets || '0')
				])
			])
		]);
	},

	refreshStatus: function() {
		return fs.exec('/etc/init.d/nf_deaf', ['status']).then(L.bind(function(res) {
			var st = this.parseStatus(res);

			var set = function(id, txt) {
				var el = document.getElementById(id);
				if (el) el.textContent = txt;
			};

			set('nf-deaf-running', this.fmtRunning(st));
			set('nf-deaf-module', this.fmtModule(st));
			set('nf-deaf-domain', st.domain || '-');
			set('nf-deaf-target', st.target || '-');
			set('nf-deaf-packets', st.packets || '0');
		}, this)).catch(function() {});
	},

	render: function(statusRes) {
		var self = this;

		var st = this.parseStatus(statusRes);
		var statusNode = this.buildStatusNode(st);

		poll.add(L.bind(this.refreshStatus, this), 5);

		var m = new form.Map('nf_deaf', _('NF Deaf 流量伪装'),
			_('基于内核模块 nf_deaf：当访问指定目标（例如 135.224.117.8）时，' +
				'向该方向注入伪造的 HTTP 请求报文（Host 域名可自定义），其余流量不受影响。' +
				'需要固件包含 kmod-nf-deaf，且内核启用 debugfs 才能自定义伪造域名。'));

		var s = m.section(form.NamedSection, 'config', 'nf_deaf', _('基本设置'));
		s.addremove = false;

		var o;

		o = s.option(form.Flag, 'enabled', _('开启伪造'),
			_('总开关；关闭后移除全部伪造规则并卸载内核模块'));
		o.rmempty = false;

		o = s.option(form.Value, 'fake_domain', _('伪造域名（Host）'),
			_('伪造报文中 HTTP 请求头的 Host 域名，例如 www.speedtest.cn'));
		o.rmempty = false;
		o.placeholder = 'www.speedtest.cn';
		o.datatype = 'hostname';
		o.validate = function(section_id, value) {
			if (!value)
				return _('必须填写伪造域名');
			if (value.length > 200)
				return _('域名过长');
			return true;
		};

		o = s.option(form.Flag, 'target_only', _('仅针对指定目标'),
			_('勾选后，仅当访问下方目标 IP 时进行伪造，其他 IP / 域名访问均不受影响；' +
				'不勾选则对所有出站 TCP 流量进行伪造（流量会明显增加，请谨慎使用）'));
		o.rmempty = false;
		o.default = '1';

		o = s.option(form.Value, 'target_ip', _('目标 IP'),
			_('仅伪造访问该 IP 的流量，支持 IPv4 / IPv6，例如 135.224.117.8'));
		o.rmempty = true;
		o.placeholder = '135.224.117.8';
		o.datatype = 'ipaddr';
		o.depends('target_only', '1');
		o.validate = function(section_id, value) {
			if (!value)
				return _('已选择仅针对指定目标，必须填写目标 IP');
			return true;
		};

		o = s.option(form.Value, 'target_port', _('目标端口（可选）'),
			_('仅伪造访问该端口的流量，留空表示所有端口'));
		o.rmempty = true;
		o.placeholder = '80';
		o.datatype = 'port';

		o = s.option(form.Value, 'repeat', _('额外重复份数'),
			_('每个触发报文额外注入的重复伪造报文个数（0 - 7），一般保持 0 即可'));
		o.rmempty = false;
		o.placeholder = '0';
		o.default = '0';
		o.datatype = 'range(0,7)';

		return m.render().then(function(node) {
			return E('div', {}, [ statusNode, node ]);
		});
	}
});
