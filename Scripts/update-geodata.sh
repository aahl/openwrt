#!/bin/sh
# /etc/dae/update-geodata.sh —— dae geodata 自动更新（固件预置，每天 04:30 由 crond 触发）
#
# 原理：dae 按 /etc/dae → /usr/share/dae 的顺序搜索 geoip.dat / geosite.dat
#       （dae 源码 common/assets/assets.go），下载到可写的 /etc/dae/ 即覆盖固件内置版本；
#       旧文件留在只读分区作兜底，/etc 跨 sysupgrade 持久。
#       下载成功后调用 /etc/init.d/dae hot_reload 热重载（SIGUSR1，不断连接），
#       reload 会重读 dat 并顺带重新拉取订阅节点。
# 节流：dat 下载每 FRESH_DAYS 天最多一次（戳记 /etc/dae/.geodata_stamp），
#       其余执行只做热重载，用来每日刷新订阅节点。

DAE_DIR="/etc/dae"
TMP_DIR="/tmp/dae-geodata"
STAMP="$DAE_DIR/.geodata_stamp"
TAG="dae-geodata"
FRESH_DAYS=7

# 下载源：第一个为 GitHub 直连（在路由器上按 dae 分流自动走代理出去）；
# 其余为直连兜底镜像，全部失效时自行替换
MIRRORS="
https://github.com/Loyalsoldier/v2ray-rules-dat/releases/latest/download
https://gh-proxy.com/https://github.com/Loyalsoldier/v2ray-rules-dat/releases/latest/download
https://ghfast.top/https://github.com/Loyalsoldier/v2ray-rules-dat/releases/latest/download
"

log() { logger -t "$TAG" "$*"; echo "$*"; }

# dae 未启用就不折腾（避免在不用 dae 的机器上白下载 27MB）
[ "$(uci -q get dae.config.enabled)" = "1" ] || { log "dae 未启用，跳过"; exit 0; }

download() {   # $1 = geoip.dat / geosite.dat
    local f="$1" m size want got
    for m in $MIRRORS; do
        rm -f "$TMP_DIR/$f" "$TMP_DIR/$f.sum"
        if wget -q -T 30 -O "$TMP_DIR/$f" "$m/$f"; then
            size=$(wc -c < "$TMP_DIR/$f" 2>/dev/null)
            case "$size" in ''|*[!0-9]*) size=0;; esac
            [ "$size" -lt 1000000 ] && { log "$f: 下载不完整(${size}B, $m)"; continue; }
            if wget -q -T 15 -O "$TMP_DIR/$f.sum" "$m/$f.sha256sum"; then
                want=$(awk '{print $1}' "$TMP_DIR/$f.sum" 2>/dev/null)
                got=$(sha256sum "$TMP_DIR/$f" 2>/dev/null | awk '{print $1}')
                if [ -n "$want" ] && [ -n "$got" ] && [ "$want" != "$got" ]; then
                    log "$f: sha256 校验失败($m)"
                    continue
                fi
            fi
            return 0
        fi
    done
    return 1
}

[ -d "$DAE_DIR" ] || mkdir -p "$DAE_DIR"
mkdir -p "$TMP_DIR"

now=$(date +%s)
last=0
[ -f "$STAMP" ] && { last=$(cat "$STAMP" 2>/dev/null); case "$last" in ''|*[!0-9]*) last=0;; esac; }

if [ "$last" -gt 0 ] && [ $((now - last)) -lt $((FRESH_DAYS * 86400)) ]; then
    log "dat 距上次下载不足 ${FRESH_DAYS} 天，仅热重载"
else
    ok=0
    for f in geoip.dat geosite.dat; do
        if download "$f"; then
            if cmp -s "$TMP_DIR/$f" "$DAE_DIR/$f"; then
                log "$f: 内容未变化"
            else
                mv -f "$TMP_DIR/$f" "$DAE_DIR/$f" && log "$f: 已更新"
            fi
            ok=$((ok + 1))
        else
            log "$f: 所有下载源均失败，保留现有文件"
        fi
        rm -f "$TMP_DIR/$f" "$TMP_DIR/$f.sum"
    done
    # 两个文件都成功拿到才写戳记，否则明天整点再试
    [ "$ok" -eq 2 ] && echo "$now" > "$STAMP"
fi
rm -rf "$TMP_DIR"

# 热重载：重读 /etc/dae 下的 dat 并重新拉取订阅
if /etc/init.d/dae running 2>/dev/null; then
    if /etc/init.d/dae hot_reload; then
        log "dae 已热重载"
    else
        log "dae 热重载失败，可查看 logread -e dae"
    fi
else
    log "dae 未在运行，新 dat 将在下次启动时生效"
fi

exit 0
