VXLAN_ID="{1}" 
VXLAN_IF="vxlan$VXLAN_ID"

ip link delete "$VXLAN_IF"

echo "vxlan deleted successfully"