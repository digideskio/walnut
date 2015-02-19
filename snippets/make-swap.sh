# /etc/dphys-swapfile 
fallocate -l 1G /mnt/data/swapfile
mkswap /mnt/data/swapfile
swapon /mnt/data/swapfile

#sudo service dphys-swapfile start
#cat /etc/dphys-swapfile
#CONF_SWAPSIZE=1024
#CONF_SWAPFILE=/mnt/data/swapfile
