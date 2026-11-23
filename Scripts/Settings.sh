#!/bin/bash
. $(dirname "$(realpath "$0")")/function.sh

#机型组网角色:1=mesh 子节点(旁路由,.2/.3 + 关DHCP),0=独立路由(与主同配置,.1,不组mesh)
#各机型 Config/GENERAL-<机型>.txt 中 "# MESH_NODE=y/n" 可覆盖;默认 cs-02 独立、亚瑟/NN6000 组网
MESH_NODE=$(sed -n 's/^#[[:space:]]*MESH_NODE=\(.*\)/\1/p' "$GITHUB_WORKSPACE/Config/GENERAL-${WRT_DEVICE}.txt" 2>/dev/null | tail -n 1)
case "$MESH_NODE" in
	y|1) MESH_NODE=1 ;;
	n|0) MESH_NODE=0 ;;
	*)
		case "$WRT_DEVICE" in
			jdcloud_re-ss-01|link_nn6000-v2) MESH_NODE=1 ;;
			*) MESH_NODE=0 ;;
		esac
		;;
esac

#按角色设定默认 LAN 地址
if [ "$MESH_NODE" = "1" ]; then
	case "$WRT_DEVICE" in
		jdcloud_re-ss-01) LAN_IP="192.168.68.2" ;;
		link_nn6000-v2) LAN_IP="192.168.68.3" ;;
		*) LAN_IP="192.168.68.2" ;;
	esac
else
	LAN_IP="192.168.68.1"
fi

#修改默认主题
sed -i "s/luci-theme-bootstrap/luci-theme-$WRT_THEME/g" $(find ./feeds/luci/collections/ -type f -name "Makefile")
#修改immortalwrt.lan关联IP
sed -i "s/192\.168\.[0-9]*\.[0-9]*/$LAN_IP/g" $(find ./feeds/luci/modules/luci-mod-system/ -type f -name "flash.js")
#添加编译日期标识
sed -i "s/(\(luciversion || ''\))/(\1) + (' \/ DaeWRT-$WRT_DATE')/g" $(find ./feeds/luci/modules/luci-mod-status/ -type f -name "10_system.js")

WIFI_SH=$(find ./target/linux/{mediatek/filogic,qualcommax}/base-files/etc/uci-defaults/ -type f -name "*set-wireless.sh" 2>/dev/null)
WIFI_UC="./package/network/config/wifi-scripts/files/lib/wifi/mac80211.uc"
if [ -f "$WIFI_SH" ]; then
	#修改WIFI名称
	sed -i "s/BASE_SSID='.*'/BASE_SSID='$WRT_SSID'/g" $WIFI_SH
	#修改WIFI密码
	sed -i "s/BASE_WORD='.*'/BASE_WORD='$WRT_WORD'/g" $WIFI_SH
elif [ -f "$WIFI_UC" ]; then
	#修改WIFI名称
	sed -i "s/ssid='.*'/ssid='$WRT_SSID'/g" $WIFI_UC
	#修改WIFI密码
	sed -i "s/key='.*'/key='$WRT_WORD'/g" $WIFI_UC
	#修改WIFI地区
	sed -i "s/country='.*'/country='AU'/g" $WIFI_UC
	#修改WIFI加密
	sed -i "s/encryption='.*'/encryption='psk2+ccmp'/g" $WIFI_UC

	#有线回程 Mesh:三台同 SSID,默认注入 802.11r/k/v 支撑快速漫游
	#(FT-PSK 无需 RADIUS,usteer 依赖 802.11k/v 做终端引导)
	cat > /tmp/ft_snippet.uc <<'EOF'
		print(`set ${si}.ieee80211r='1'
set ${si}.mobility_domain='0001'
set ${si}.ft_psk_generate_local='1'
set ${si}.ieee80211k='1'
set ${si}.bss_transition='1'

`);
EOF
	sed -i "/config\[name\] = {};/r /tmp/ft_snippet.uc" $WIFI_UC
	rm -f /tmp/ft_snippet.uc
fi

CFG_FILE="./package/base-files/files/bin/config_generate"
#修改默认IP地址（按机型）
sed -i "s/192\.168\.[0-9]*\.[0-9]*/$LAN_IP/g" $CFG_FILE
#修改默认主机名
sed -i "s/hostname='.*'/hostname='$WRT_NAME'/g" $CFG_FILE

#mesh 子节点角色烧录：关闭本机 DHCP，网关/DNS 指向主路由（由 MESH_NODE 决定）
if [ "$MESH_NODE" = "1" ]; then
	mkdir -p ./files/etc/uci-defaults
	cat > ./files/etc/uci-defaults/99_node_role <<'EOF'
#!/bin/sh
# 哑节点角色：本机不提供 DHCP，网关/DNS 指向主路由 192.168.68.1
uci -q set dhcp.lan.ignore='1'
uci -q set network.lan.gateway='192.168.68.1'
uci -q add_list network.lan.dns='192.168.68.1'
uci -q commit dhcp
uci -q commit network
exit 0
EOF
fi

#主路由(cs-02):nlbwmon 统计数据库放持久路径,重启不丢数据
if [ "$WRT_DEVICE" = "jdcloud_re-cs-02" ]; then
	mkdir -p ./files/etc/uci-defaults
	cat > ./files/etc/uci-defaults/99_main_extras <<'EOF'
#!/bin/sh
[ -f /etc/config/nlbwmon ] || exit 0
mkdir -p /etc/nlbwmon
uci -q set nlbwmon.@nlbwmon[0].database_directory='/etc/nlbwmon'
uci -q commit nlbwmon
[ -x /etc/init.d/nlbwmon ] && /etc/init.d/nlbwmon enable >/dev/null 2>&1
[ -x /etc/init.d/nlbwmon ] && /etc/init.d/nlbwmon start >/dev/null 2>&1
exit 0
EOF
fi

#所有机型:防御性清除 dropbear 的 DirectInterface 绑定
#(实测 NSS 数据路径下该绑定会导致 SSH 对外拒绝连接,表现为 22 端口 RST)
mkdir -p ./files/etc/uci-defaults
cat > ./files/etc/uci-defaults/99_dropbear_guard <<'EOF'
#!/bin/sh
for s in $(uci -q show dropbear 2>/dev/null | cut -d. -f2 | cut -d= -f1 | sort -u); do
	[ -n "$s" ] && uci -q delete "dropbear.$s.DirectInterface"
done
uci -q commit dropbear
exit 0
EOF

#所有机型:dae 配置文件属主权限(dae 校验 config.dae 含凭据须 0600,
#包默认 0644 会导致首次启动拒绝,原 workflow 中该修复被注释在错误位置)
cat > ./files/etc/uci-defaults/99_dae_perm <<'EOF'
#!/bin/sh
[ -f /etc/dae/config.dae ] && chmod 600 /etc/dae/config.dae
exit 0
EOF

vlmcsd_patches="./feeds/packages/net/vlmcsd/patches/"
mkdir -p $vlmcsd_patches && cp -f ../patches/001-fix_compile_with_ccache.patch $vlmcsd_patches

# usteer 源码强制升级到上游 7532e12(2026-05-19 HEAD):
# LiBwrt v25.12.1 的 packages feed pin(immortalwrt/packages@e93a938)只给到 1d6524c(2025-10-04),
# 缺 2025-10 后合入的漫游特性——协商阶梯(aggressiveness/aggressiveness_mac_list,上游 49ba5f1)、
# band_steering 动态阈值防乒乓、DEAUTH reason codes、reassoc_delay+MBO reason 5(7532e12)等,
# 99_meshtopo 的二进制探测会走旧版回退分支,协商阶梯参数全部休眠。
# 这里把 feed 内 Makefile 的源码版本改到 7532e12,与候选感知补丁的制作基线一致;
# PKG_MIRROR_HASH 取自 openwrt/packages@02cd7a4(官方 2026-05-19 升级提交),三值必须配套。
# 若日后 LiBwrt feed pin 已自带 7532e12,sed 无匹配即空跑,固件用 feed 原版本。
usteer_mk="./feeds/packages/net/usteer/Makefile"
if [ -f "$usteer_mk" ] && grep -q 'PKG_SOURCE_VERSION:=1d6524c6e6b58853f053c7816249a8f68ad9b0e8' "$usteer_mk"; then
	sed -i \
		-e 's/^PKG_SOURCE_DATE:=.*/PKG_SOURCE_DATE:=2026-05-19/' \
		-e 's/^PKG_SOURCE_VERSION:=.*/PKG_SOURCE_VERSION:=7532e1252fb937fe34b6da05e86fd34babd91ef5/' \
		-e 's/^PKG_MIRROR_HASH:=.*/PKG_MIRROR_HASH:=7d49d3659c07bebb9c9f68953bbf074840f83de4d38b578e08672b3029506088/' \
		"$usteer_mk"
fi

# usteer 候选感知补丁:低于 min_snr 的关联拒绝/踢线前,先查全节点视角是否有更优候选,
# 没有更好的去处就放行(弱连接好过没连接,覆盖边缘死角"信号可用却被拒"的锁死问题)。
# 补丁按 usteer 上游 7532e12 源码制作并经 git apply --check 干净适配(无 hunk 偏移);
# 旧 pin 的 1d6524c 也能打上(hunk#2 偏移 -41 行,find_better_candidate 签名未变,两版均可编译)。
# 若日后升级 usteer 导致 hunk 失配,构建会失败提醒,届时移植或删除此行。
usteer_patches="./feeds/packages/net/usteer/patches/"
mkdir -p $usteer_patches && cp -f ../patches/001-usteer-candidate-aware-assoc-kick.patch $usteer_patches

#修复dropbear
# #sed -i "s/Interface/DirectInterface/" ./package/network/services/dropbear/files/dropbear.config
# sed -i "/Interface/d" ./package/network/services/dropbear/files/dropbear.config
# #拷贝files 文件夹到编译目录
# cp -r ../files ./

#配置文件修改
echo "CONFIG_PACKAGE_luci=y" >> ./.config
echo "CONFIG_LUCI_LANG_zh_Hans=y" >> ./.config
echo "CONFIG_PACKAGE_luci-theme-$WRT_THEME=y" >> ./.config
echo "CONFIG_PACKAGE_luci-app-$WRT_THEME-config=y" >> ./.config

#手动调整的插件
if [ -n "$WRT_PACKAGE" ]; then
	echo -e "$WRT_PACKAGE" >> ./.config
fi

#高通平台调整
DTS_PATH="./target/linux/qualcommax/files/arch/arm64/boot/dts/qcom/"
if [[ $WRT_TARGET == *"QUALCOMMAX"* ]]; then
	#取消nss相关feed
	echo "CONFIG_FEED_nss_packages=n" >> ./.config
	echo "CONFIG_FEED_sqm_scripts_nss=n" >> ./.config
	#设置NSS版本
	echo "CONFIG_NSS_FIRMWARE_VERSION_11_4=n" >> ./.config
	echo "CONFIG_NSS_FIRMWARE_VERSION_12_5=y" >> ./.config
	#开启sqm-nss插件
	echo "CONFIG_PACKAGE_luci-app-sqm=y" >> ./.config
	echo "CONFIG_PACKAGE_sqm-scripts-nss=y" >> ./.config
	#无WIFI配置调整Q6大小
	if [[ "${WRT_CONFIG,,}" == *"wifi"* && "${WRT_CONFIG,,}" == *"no"* ]]; then
		find $DTS_PATH -type f ! -iname '*nowifi*' -exec sed -i 's/ipq\(6018\|8074\).dtsi/ipq\1-nowifi.dtsi/g' {} +
		echo "qualcommax set up nowifi successfully!"
	fi
fi
