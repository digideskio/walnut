#!/bin/bash
mkdir /mnt/data
mount /dev/sda1 /mnt/data
fallocate -l 100G /mnt/data/WALNUT_ENCRYPTED.virtual.disk
apt-get update
apt-get install --yes cryptsetup
cryptsetup -y luksFormat /mnt/data/WALNUT_ENCRYPTED.virtual.disk
# you'll be asked to type YES in all caps
# Then you'll be asked for a passphrase

file /mnt/data/WALNUT_ENCRYPTED.virtual.disk

cryptsetup luksOpen /mnt/data/WALNUT_ENCRYPTED.virtual.disk WALNUT_ENCRYPTED
# you'll be asked for your passphrase

mkfs.ext4 -j /dev/mapper/WALNUT_ENCRYPTED
mkdir /mnt/WALNUT_ENCRYPTED
mount /dev/mapper/WALNUT_ENCRYPTED /mnt/WALNUT_ENCRYPTED

#pi@pi /s/walnut> time sudo mv /mnt/WALNUT_ENCRYPTED/vhosts/ /mnt/data/vhosts
#0.49user 4.02system 0:18.60elapsed 24%CPU (0avgtext+0avgdata 2812maxresident)k
#71160inputs+66152outputs (1major+455minor)pagefaults 0swaps
#pi@pi /s/walnut> time sudo rsync -a /mnt/data/vhosts /mnt/WALNUT_ENCRYPTED/vhosts
#2.75user 5.93system 0:22.03elapsed 39%CPU (0avgtext+0avgdata 5200maxresident)k
#54816inputs+66152outputs (3major+2786minor)pagefaults 0swaps
#pi@pi /s/walnut> time sudo rsync -a /mnt/data/vhosts /mnt/data/vhosts-2
#2.64user 5.98system 0:13.36elapsed 64%CPU (0avgtext+0avgdata 5364maxresident)k
#44416inputs+66152outputs (1major+3059minor)pagefaults 0swaps
#pi@pi /s/walnut> time sudo rsync -a /mnt/WALNUT_ENCRYPTED/vhosts /mnt/WALNUT_ENCRYPTED/vhosts-2
#2.48user 6.19system 0:30.81elapsed 28%CPU (0avgtext+0avgdata 5328maxresident)k
#66264inputs+66152outputs (3major+2683minor)pagefaults 0swaps

#pi@pi /s/walnut> time sudo rm -rf /mnt/data/vhosts*
#0.02user 0.04system 0:00.21elapsed 28%CPU (0avgtext+0avgdata 2804maxresident)k
#120inputs+0outputs (3major+372minor)pagefaults 0swaps
#pi@pi /s/walnut> time sudo rm -rf /mnt/WALNUT_ENCRYPTED/vhosts-2/
#0.07user 0.74system 0:00.86elapsed 93%CPU (0avgtext+0avgdata 2768maxresident)k
#0inputs+0outputs (0major+402minor)pagefaults 0swaps
