# maintained for fedora 40/41 
# make sure to ssh using -A !. After reinstall make sure that OVH allows traffic on priviledged ports (22), which is usually disabled
sudo dnf update
sudo dnf install git rustup clang lld openssl-devel

#install the rust stdlib&compiler
rustup-init 
. "$HOME/.cargo/env"

# apply openssl-devel to every running service
sudo reboot 

git clone git@github.com:MRandl/website
cd website
cargo build --release

sudo nano /etc/ssh/sshd_config.d/90-user.conf 
# Port 50001




