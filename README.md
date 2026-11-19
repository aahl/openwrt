# DAEWRT-MINI
高通IPQ60XX平台多机型精简固件包  MINI版
  
  支持设备：
  - 京东云亚瑟 AX1800 Pro（jdcloud_re-ss-01）
  - 京东云 RE-CS-02（jdcloud_re-cs-02）
  - Link NN6000 v2（link_nn6000-v2）
  
  超强精简，核心插件为luci-app-dae，各机型插件略有差异（京东云机型含samba4、tailscale），详见 `Config/GENERAL-<设备名>.txt`，内存占用仅65%。

  固件集成增强版geoip.dat、geosite.dat,开箱即用，正确配置Dae不会报错

  源码来自：  [VIKINGYFY](https://github.com/VIKINGYFY/OpenWRT-CI) & [davidtall](https://github.com/davidtall/DaeWRT-CI)  
  略微修改，适度精简，确保最大性能发挥。  

  追求更多功能➡️https://github.com/GHNERCH/DAEWRT-AX1800PRO
  
  开启内核eBPF，Dae吃鹅优选，建议1GB内存使用（京东云亚瑟为硬改1GB）。
  
  京东云亚瑟AX1800 Pro刷机前请更换分区表和uboot,参考链接: https://www.right.com.cn/forum/thread-8402269-1-1.html；Link NN6000 v2 等其余机型请参考各自的刷机教程            
  
  全系带开源硬件加速。
