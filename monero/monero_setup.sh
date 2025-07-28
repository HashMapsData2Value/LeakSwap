mkdir leakswap_testnet

# Setup the two Monero Daemon Nodes
monerod --testnet --data-dir leakswap_testnet/node_01 --p2p-bind-ip 127.0.0.1 --p2p-bind-port 28080 --rpc-bind-port 28081 --zmq-rpc-bind-port 28082 --add-exclusive-node 127.0.0.1:38080 --no-igd --hide-my-port --log-level 0 --fixed-difficulty 100 --disable-rpc-ban
monerod --testnet --data-dir leakswap_testnet/node_02 --p2p-bind-ip 127.0.0.1 --p2p-bind-port 38080 --rpc-bind-port 38081 --zmq-rpc-bind-port 38082 --add-exclusive-node 127.0.0.1:28080 --no-igd --hide-my-port --log-level 0 --fixed-difficulty 100 --disable-rpc-ban

# Start up the Monero Wallet RPC 
monero-wallet-rpc --testnet --rpc-bind-port 28088 --wallet-dir leakswap_testnet --disable-rpc-login
monero-wallet-rpc --testnet --rpc-bind-port 38088 --wallet-dir leakswap_testnet --disable-rpc-login