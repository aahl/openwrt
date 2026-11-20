#!/bin/bash
. $(dirname "$(realpath "$0")")/function.sh

#按机型设定默认 LAN 地址（cs-02 主路由 .1，亚瑟/NN6000 为节点 .2/.3）
case "$WRT_DEVICE" in
	jdcloud_re-cs-02) LAN_IP="192.168.68.1" ;;
	jdcloud_re-ss-01) LAN_IP="192.168.68.2" ;;
	link_nn6000-v2) LAN_IP="192.168.68.3" ;;
	*) LAN_IP="${WRT_IP:-192.168.68.1}" ;;
esac

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
set ${si}.mobility_domain='1'
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

#节点机型(亚瑟/NN6000)默认烧入哑节点角色：关闭本机 DHCP，网关/DNS 指向主路由
if [ "$WRT_DEVICE" = "jdcloud_re-ss-01" ] || [ "$WRT_DEVICE" = "link_nn6000-v2" ]; then
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

vlmcsd_patches="./feeds/packages/net/vlmcsd/patches/"
mkdir -p $vlmcsd_patches && cp -f ../patches/001-fix_compile_with_ccache.patch $vlmcsd_patches

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
