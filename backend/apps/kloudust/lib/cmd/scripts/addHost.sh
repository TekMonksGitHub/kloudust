#!/bin/bash

# Params
# {1} The new password for this host for the ID which is logged in to run this script
# {2} The JSON out splitter
# {3} The new SSH port, defaults to 22 if not provided
# {4} The agent port, defaults to 24 if not provided
# {5} The default host network, defaults to kddefault if not provided

NEW_PASSWORD="{1}"
JSONOUT_SPLITTER="{2}"
CHANGED_SSH_PORT={3}
NEW_SSH_PORT=${CHANGED_SSH_PORT:-22}
INCOMING_AGENT_PORT={4}
AGENT_PORT=${INCOMING_AGENT_PORT:-24}
DEFAULT_KD_NET_IN={5}
DEFAULT_KD_NET=${DEFAULT_KD_NET_IN:-kddefault}
DEFAULT_KD_NET_BRIDGE="${DEFAULT_KD_NET}_br"

function exitFailed() {
    echo Failed
    exit 1
}

function printConfig() {
    CORESPERCPU=`lscpu | grep "Core(s) per socket" | tr -s " " | cut -d":" -f2 | xargs`
    SOCKETS=`lscpu | grep Socket | tr -s " " | cut -d":" -f2 | xargs`
    CORES=`lscpu | grep '^CPU(s):' | tr -s " " | cut -d":" -f2 | xargs`
    PROCESSORMAKER=`lscpu | grep 'Vendor ID' | tr -s " " | cut -d":" -f2 | xargs`
    PROCESSORNAME=`lscpu | grep 'Model name' | tr -s " " | cut -d":" -f2 | xargs`
    PROCESSORMODEL=`lscpu | grep 'Model:' | tr -s " " | cut -d":" -f2 | xargs`
    PROCESSORSPEED=`lscpu | grep 'CPU max MHz' | tr -s " " | cut -d":" -f2 | xargs`
    PROCESSORARCH=`lscpu | grep 'Architecture:' | tr -s " " | cut -d":" -f2 | xargs`
    if [ "$PROCESSORARCH" == "x86_64" ]; then PROCESSORARCH=amd64; fi
    MEMORY=`free -b | grep "Mem:" | tr -s " " | cut -d" " -f2`
    ROOTDISKTOTAL=`df -B1  / | tail -n+2 | tr -s " " | cut -d" " -f2`
    NETSPEED=$((1073741824*$(networkctl status `networkctl | grep routable | grep ether | head -n1 | xargs | cut -d" " -f2` | grep -i speed | xargs | cut -d" " -f2 | cut -d"G" -f1)))
    OSRELEASE=$(printf "$(cat /etc/issue)" | head -n1 | xargs)

cat <<ENDJSON
$1
{
    "cores": "$CORES",
    "memory": "$MEMORY",
    "disk": "$ROOTDISKTOTAL",
    "netspeed": "$NETSPEED",
    "processor": "$PROCESSORMAKER:$PROCESSORNAME:$PROCESSORMODEL:$PROCESSORSPEED",
    "processorarchitecture": "$PROCESSORARCH",
    "sockets": "$SOCKETS",
    "ostype": "$OSRELEASE",
    "sshport": "$NEW_SSH_PORT"
}
ENDJSON
}


printf "Updating the system\n"
if [ -f "`which yum`" ]; then 
    if ! sudo yum -y install epel-release; then exitFailed; fi
    if ! sudo yum -y update; then exitFailed; fi
else 
    if ! yes | sudo DEBIAN_FRONTEND=noninteractive apt -qq -y update; then exitFailed; fi
    if ! yes | sudo DEBIAN_FRONTEND=noninteractive apt -qq -y upgrade; then exitFailed; fi
    if ! yes | sudo DEBIAN_FRONTEND=noninteractive apt -qq -y autoremove; then exitFailed; fi
fi


printf "Installing required software\n"
if [ -f "`which yum`" ]; then 
    if ! sudo yum -y install fail2ban; then exitFailed; fi
    if ! sudo yum -y install sshpass; then exitFailed; fi
    if ! sudo yum -y install jq; then exitFailed; fi
    if ! sudo yum -y install qemu-kvm libvirt virt-top bridge-utils libguestfs-tools virt-install tuned genisoimage; then exitFailed; fi
    if ! sudo systemctl stop firewalld; then exitFailed; fi
    if ! sudo systemctl disable firewalld; then exitFailed; fi
    if ! sudo systemctl mask firewalld; then exitFailed; fi
    if ! sudo yum -y install iptables-services; then exitFailed; fi
else
    if ! yes | sudo DEBIAN_FRONTEND=noninteractive apt -qq -y install fail2ban; then exitFailed; fi
    if ! yes | sudo DEBIAN_FRONTEND=noninteractive apt -qq -y install sshpass; then exitFailed; fi
    if ! yes | sudo DEBIAN_FRONTEND=noninteractive apt -qq -y install jq; then exitFailed; fi
    if ! yes | sudo DEBIAN_FRONTEND=noninteractive apt -qq -y install net-tools iptables-persistent; then exitFailed; fi
    if ! yes | sudo DEBIAN_FRONTEND=noninteractive apt -qq -y install qemu-system-x86 libvirt-daemon-system libvirt-clients bridge-utils virtinst libosinfo-bin guestfs-tools tuned genisoimage; then exitFailed; fi
    # Remove snapd on Ububtu as it opens outgoing connections to the snap store
    # Also remove ufw as we will use nftables directly 
    snap list 2>/dev/null | egrep -v 'base$|snapd$|Notes$' | awk '{print $1}' | xargs -I{} sudo snap remove {} --purge 2>/dev/null || true
    sudo apt purge -y snapd 2>/dev/null || true
    rm -rf ~/snap
    sudo apt purge -y ufw
    sudo apt -y autoremove && sudo apt-mark hold snapd ufw
fi


printf "\n\nSecuring the system against SSH attacks\n"
sudo tee /tmp/kdfail2ban.jail.local > /dev/null <<EOF
[DEFAULT]
# Ban hosts for one hour:
bantime = 3600

# Override /etc/fail2ban/jail.d/00-firewalld.conf:
banaction = iptables-multiport

[sshd]
enabled = true
EOF
if [ $? -ne 0 ]; then exitFailed; fi
if ! sudo mv /tmp/kdfail2ban.jail.local /etc/fail2ban/jail.local; then exitFailed; fi
if ! sudo chown root:root /etc/fail2ban/jail.local; then exitFailed; fi
if ! sudo systemctl enable --now fail2ban; then exitFailed; fi


printf "\n\nEnabling hypervisor\n"
if ! sudo systemctl enable --now libvirtd; then exitFailed; fi
if ! sudo lsmod | grep -i kvm; then exitFailed; fi
if ! sudo systemctl enable --now tuned; then exitFailed; fi
if ! sudo tuned-adm profile virtual-host; then exitFailed; fi


printf "\n\nDisabling libvirt default networking\n"
sudo virsh net-destroy default &> /dev/null
sudo virsh net-autostart --network default --disable &> /dev/null
sudo virsh net-undefine default &> /dev/null


printf "\n\nCreating Kloudust Structures\n"
if ! sudo mkdir -p /kloudust/catalog/; then exitFailed; fi
if ! sudo mkdir -p /kloudust/drivers/; then exitFailed; fi
if ! sudo mkdir -p /kloudust/disks/; then exitFailed; fi
if ! sudo mkdir -p /kloudust/metadata/; then exitFailed; fi
if ! sudo mkdir -p /kloudust/snapshots/; then exitFailed; fi
if ! sudo mkdir -p /kloudust/temp/; then exitFailed; fi
if ! sudo mkdir -p /kloudust/recyclebin/; then exitFailed; fi
if ! sudo mkdir -p /kloudust/system/; then exitFailed; fi
if ! sudo mkdir -p /kloudust/etc/; then exitFailed; fi


printf "\n\nDownloading additional drivers\n"
if [ "$(sudo cat /kloudust/drivers/virtio-win.version 2>/dev/null)" != "virtio-win-0.1.240.iso" ]; then
    if ! sudo bash -c "curl -L https://fedorapeople.org/groups/virt/virtio-win/direct-downloads/archive-virtio/virtio-win-0.1.240-1/virtio-win-0.1.240.iso > /kloudust/drivers/virtio-win.iso"; then exitFailed; fi
    if ! sudo bash -c  'echo "virtio-win-0.1.240.iso" > /kloudust/drivers/virtio-win.version'; then exitFailed; fi
fi;


printf "\n\nGiving permissions to Kloudust folders to KVM\n"
if [ -f "`which yum`" ]; then 
    if ! sudo chgrp -R qemu /kloudust/; then exitFailed; fi
else 
    if ! sudo chgrp -R libvirt /kloudust/; then exitFailed; fi
fi


printf "\n\nAdding the default Kloudust network\n"
if [ -n "$(sudo virsh net-list --all --name | grep -xF $DEFAULT_KD_NET)" ]; then    # delete old network if found
    sudo virsh net-destroy $DEFAULT_KD_NET &> /dev/null
    if ! sudo virsh net-undefine $DEFAULT_KD_NET; then exitFailed; fi
fi
sudo tee /kloudust/temp/$DEFAULT_KD_NET.xml > /dev/null <<EOF
<network>
  <name>$DEFAULT_KD_NET</name>
  <bridge name='$DEFAULT_KD_NET_BRIDGE' stp='off'/>
  <forward mode='nat'/>
  <ip address='192.168.0.1' netmask='255.255.0.0'>
    <dhcp>
      <range start='192.168.0.2' end='192.168.255.254'/>
    </dhcp>
  </ip>
</network>
EOF
if [ $? -ne 0 ]; then exitFailed; fi
sudo virsh net-destroy $DEFAULT_KD_NET &> /dev/null
virsh net-undefine $DEFAULT_KD_NET &> /dev/null
if ! sudo virsh net-define /kloudust/temp/$DEFAULT_KD_NET.xml; then exitFailed; fi
if ! sudo virsh net-autostart $DEFAULT_KD_NET; then exitFailed; fi  # reboot will start it  

# Setup the run-parts KD service which starts our services and some basic services under it
sudo tee "/usr/lib/systemd/system/kd-startup.service" > /dev/null <<EOF
[Unit]
Description=Run KD startup scripts on boot
After=multi-user.target

[Service]
Type=oneshot
ExecStart=/usr/bin/run-parts --regex ".*" /kloudust/system
StandardOutput=append:/var/log/kdrunparts.log
StandardError=append:/var/log/kdrunparts.log

[Install]
WantedBy=multi-user.target
EOF
if [ $? -ne 0 ]; then exitFailed; fi
if ! sudo systemctl enable kd-startup.service; then exitFailed; fi    

# Create NFT firewall auto-restart service
sudo tee "/kloudust/system/000-start-nftables" > /dev/null <<EOF
#!/bin/bash
/usr/bin/systemctl restart nftables.service
systemctl restart libvirtd  # this sets up LIBVIRT iptabes
EOF
if [ $? -ne 0 ]; then exitFailed; fi
if ! sudo chmod +x /kloudust/system/000-start-nftables; then exitFailed; fi    

# Create default network start service as virsh net-autostart is not reliable
sudo tee "/kloudust/system/010-start-$DEFAULT_KD_NET-net" > /dev/null <<EOF
#!/bin/bash
VIRSH=\`command -v virsh\`
\$VIRSH net-start $DEFAULT_KD_NET
EOF
if [ $? -ne 0 ]; then exitFailed; fi
if ! sudo chmod +x /kloudust/system/010-start-$DEFAULT_KD_NET-net; then exitFailed; fi  


printf "\n\nSetting up Bridge Netfilter kernel module for virtual machine firewall support\n"
if ! echo "br_netfilter" | sudo tee /etc/modules-load.d/br_netfilter.conf > /dev/null; then exitFailed; fi
if ! sudo modprobe br_netfilter; then exitFailed; fi
sudo tee "/etc/sysctl.d/99-bridge-nf.conf" > /dev/null <<EOF
net.bridge.bridge-nf-call-iptables=1
net.bridge.bridge-nf-call-ip6tables=1
EOF
if [ $? -ne 0 ]; then exitFailed; fi
if ! sudo sysctl -p /etc/sysctl.d/99-bridge-nf.conf > /dev/null; then exitFailed; fi


printf "\n\nSetting up the host firewall, packet forwarding and ARP proxy support\n"
if ! sudo systemctl stop nftables; then exitFailed; fi                                    # Reboot will restart it
if ! sudo nft flush ruleset; then exitFailed; fi                                          # This clears libvirt entries but reboot restores them apparently
if ! sudo nft add table inet kdhostfirewall; then exitFailed; fi
if ! sudo nft add chain inet kdhostfirewall input { type filter hook input priority filter\; }; then exitFailed; fi
if ! sudo nft add rule inet kdhostfirewall input iif lo accept; then exitFailed; fi
if ! sudo nft add rule inet kdhostfirewall input iifname $DEFAULT_KD_NET_BRIDGE accept; then exitFailed; fi
if ! sudo nft add rule inet kdhostfirewall input ct state established,related accept; then exitFailed; fi
if ! sudo nft add rule inet kdhostfirewall input tcp dport $NEW_SSH_PORT accept; then exitFailed; fi
if ! sudo nft add rule inet kdhostfirewall input tcp dport $AGENT_PORT accept; then exitFailed; fi          #Agent port
if ! sudo nft rule inet kdhostfirewall input udp dport 8472 accept; then exitFailed; fi   # VxLAN port
if ! sudo nft chain inet kdhostfirewall input { policy drop\; }; then exitFailed; fi
if ! sudo nft list ruleset | sudo tee /etc/nftables.conf > /dev/null; then exitFailed; fi 
if ! sudo systemctl enable nftables; then exitFailed; fi                                  # Reboot will enforce the firewall
# Setup IP forwarding and ARP forwarding support
if ! echo 1 | sudo tee /proc/sys/net/ipv4/ip_forward > /dev/null; then exitFailed; fi   
if ! sudo grep -qxF 'net.ipv4.ip_forward=1' /etc/sysctl.conf; then
    if ! printf "\nnet.ipv4.ip_forward=1\n" | sudo tee -a /etc/sysctl.conf > /dev/null; then exitFailed; fi
fi
if ! echo 1 | sudo tee /proc/sys/net/ipv4/conf/all/proxy_arp > /dev/null; then exitFailed; fi
if ! sudo grep -qxF 'net.ipv4.conf.all.proxy_arp=1' /etc/sysctl.conf; then
    if ! printf "\nnet.ipv4.conf.all.proxy_arp=1\n" | sudo tee -a /etc/sysctl.conf > /dev/null; then exitFailed; fi
fi
if ! sudo sysctl -p /etc/sysctl.conf; then exitFailed; fi


printf "\n\nChanging password and SSH ports, Kloudust is taking over the host\n"
if [ -f "`which yum`" ]; then 
    if ! echo "$NEW_PASSWORD" | passwd --stdin `whoami` > /dev/null; then exitFailed; fi
else
    if ! echo `whoami`:"$NEW_PASSWORD" | sudo chpasswd > /dev/null; then exitFailed; fi
fi
if ! sudo sed -i 's/^#\?[ ]*[Pp]ort[ ]\+[0-9]\+[ ]*$//g' /etc/ssh/sshd_config; then exitFailed; fi
if ! echo "Port $NEW_SSH_PORT" | sudo tee -a /etc/ssh/sshd_config > /dev/null; then exitFailed; fi
if ! touch ~/.hushlogin; then exitFailed; fi
if ! sudo systemctl daemon-reload; then exitFailed; fi

printf "\n\nHost initialization finished successfully. Rebooting in 1 minutes.\n"
printConfig $JSONOUT_SPLITTER
sudo nohup shutdown -r +1 &>/dev/null &     # Background reboot
exit 0
