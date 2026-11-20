#
# Copyright (C) 2026 DAEWRT
#
# This is free software, licensed under the GPL-2.0-or-later.
#

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-meshtopo
PKG_VERSION:=1.0.0
PKG_RELEASE:=1
PKG_LICENSE:=GPL-2.0-or-later

LUCI_TITLE:=Tree style mesh network topology view
LUCI_DEPENDS:=+iw +usteer
PKGARCH:=all

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
