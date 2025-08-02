import { useState, useEffect } from 'react';

import moneroTs, { MoneroTx, MoneroWalletFull, MoneroOutputWallet, MoneroWalletListener } from "monero-ts";
import { getCompleteAddress, genPrivateSpendKey, genPrivateViewKey } from './toChocoBox2';


export default function MoneroSide() {
  // Daemon connection state
  const [daemonUrl, setDaemonUrl] = useState("http://localhost:28081");
  const [height, setHeight] = useState<number | null>(null);
  const [txsInPool, setTxsInPool] = useState<MoneroTx[]>([]);
  const [feeEstimate, setFeeEstimate] = useState<string | null>(null);


  // Wallet Full (WebAssembly) state
  const [privateSpendKey, setPrivateSpendKey] = useState(genPrivateSpendKey())
  const [restoreHeight, setRestoreHeight] = useState(1);
  const [username, setUsername] = useState("superuser");
  const [serverPassword, setServerPassword] = useState("abctesting123");
  const [walletFull, setWalletFull] = useState<MoneroWalletFull | null>(null);
  const [networkType, setNetworkType] = useState<moneroTs.MoneroNetworkType>(moneroTs.MoneroNetworkType.TESTNET);


  // UI state
  const [primaryAddress, setPrimaryAddress] = useState<string>("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [isCreatingWallet, setIsCreatingWallet] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<string>("");
  const [fundsReceived, setFundsReceived] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  // Helper function to add logs
  const addLog = (message: string) => {
    setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
    console.log(message);
  };

  const connectToDaemon = async () => {
    if (isConnecting) return;

    setIsConnecting(true);
    addLog("Connecting to daemon...");

    try {
      const daemonConnection = await moneroTs.connectToDaemonRpc({ server: daemonUrl, proxyToWorker: false });
      const currentHeight = await daemonConnection.getHeight();
      const currentFeeEstimate = await daemonConnection.getFeeEstimate();
      const currentTxsInPool = await daemonConnection.getTxPool();

      setHeight(currentHeight);
      setFeeEstimate(currentFeeEstimate.getFee().toString());
      setTxsInPool(currentTxsInPool);

      addLog(`Connected to daemon. Height: ${currentHeight}, Pool TXs: ${currentTxsInPool.length}`);
    } catch (error) {
      addLog(`Failed to connect to daemon: ${error}`);
      console.error("Failed to connect to daemon:", error);
    } finally {
      setIsConnecting(false);
    }
  };

  useEffect(() => {
    connectToDaemon();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daemonUrl]); // connectToDaemon depends on state values that change, so we'll ignore the lint warning

  const createWallet = async () => {
    if (isCreatingWallet) return;

    setIsCreatingWallet(true);
    addLog("Creating wallet from spend key...");

    try {

      const wallet = await moneroTs.createWalletFull({
        networkType: networkType,
        privateSpendKey: privateSpendKey,
        // privateViewKey omitted; will be derived from privateSpendKey
        restoreHeight: restoreHeight ?? undefined,
        server: {
          uri: daemonUrl,
          username: username,
          password: serverPassword
        }
      });

      if (privateSpendKey !== await wallet.getPrivateSpendKey()) {
        console.error("Private spend key mismatch!");
        console.error("Expected private spend key:", privateSpendKey);
        console.error("Returned private spend key:", await wallet.getPrivateSpendKey());
      }

      if (genPrivateViewKey(privateSpendKey) !== await wallet.getPrivateViewKey()) {
        console.error("Private view key mismatch!");
        console.error("Expected private view key", genPrivateViewKey(privateSpendKey));
        console.error("Returned private view key", await wallet.getPrivateViewKey());
      }

      if (
        getCompleteAddress(
          privateSpendKey,
          genPrivateViewKey(privateSpendKey),
          networkType
        ) !== await wallet.getPrimaryAddress()) {
        console.error("Complete address mismatch!");
        console.error("Expected complete address:", getCompleteAddress(
          privateSpendKey,
          genPrivateViewKey(privateSpendKey),
          networkType
        ));
        console.error("Returned complete address:", await wallet.getPrimaryAddress());
      }

      setWalletFull(wallet);
      const address = await wallet.getPrimaryAddress();
      setPrimaryAddress(address);

      // Set up listener for incoming transfers
      await wallet.addListener(new class extends MoneroWalletListener {
        async onOutputReceived(output: MoneroOutputWallet) {
          const amount = output.getAmount();
          const txHash = output.getTx().getHash();
          addLog(`Funds received! Amount: ${amount}, TX Hash: ${txHash}`);
          setFundsReceived(true);
        }
      }());

      addLog(`Wallet created successfully! Address: ${address}`);

      // Start syncing
      await syncWallet(wallet);

    } catch (error) {
      addLog(`Failed to create wallet: ${error}`);
      console.error("Failed to create wallet:", error);
    } finally {
      setIsCreatingWallet(false);
    }
  };

  const syncWallet = async (wallet: MoneroWalletFull) => {
    if (isSyncing) return;

    setIsSyncing(true);
    addLog("Starting wallet synchronization...");

    try {
      // Synchronize with progress notifications
      await wallet.sync(new class extends MoneroWalletListener {
        async onSyncProgress(height: number, _startHeight: number, endHeight: number, percentDone: number) {
          const progress = `Sync progress: ${Math.round(percentDone * 100)}% (${height}/${endHeight})`;
          setSyncProgress(progress);
          if (percentDone === 1) {
            addLog("Wallet synchronization completed!");
          }
        }
      }());

      // Start background syncing
      await wallet.startSyncing(5000);
      addLog("Background syncing started (5s interval)");

    } catch (error) {
      addLog(`Sync failed: ${error}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const createTransaction = async () => {
    if (!walletFull) {
      addLog("Wallet must be created to craft a transaction");
      return;
    }

    try {
      // Example: get balance and create a transaction
      const balance = await walletFull.getBalance();
      const transferAmount = 5000000n; // 0.005 XMR in atomic units

      if (balance < transferAmount) {
        addLog(`Insufficient funds. Balance: ${balance}, Required: ${transferAmount}`);
        return;
      }

      addLog("Creating transaction...");

      const recipientAddress = await walletFull.getAddress(1, 0);
      const createdTx = await walletFull.createTx({
        accountIndex: 0,
        address: recipientAddress,
        amount: transferAmount,
        relay: false
      });

      const fee = createdTx.getFee();
      addLog(`Transaction created! Fee: ${fee}. Ready to relay?`);

      // Relay transaction to the network
      await walletFull.relayTx(createdTx);
      addLog("Transaction relayed to network!");

    } catch (error) {
      addLog(`Failed to create transaction: ${error}`);
    }
  };

  const closeWallet = async () => {
    try {
      if (walletFull) {
        await walletFull.close();
        setWalletFull(null);
        addLog("WebAssembly wallet closed");
      }
    } catch (error) {
      addLog(`Error closing wallet: ${error}`);
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '800px' }}>
      <h1>Monero Side - LeakSwap</h1>

      {/* Daemon Connection Section */}
      <div style={{ marginBottom: '30px', padding: '15px', border: '1px solid #ccc', borderRadius: '5px' }}>
        <h2>Daemon Connection</h2>
        <div style={{ marginBottom: '10px' }}>
          <label>
            Daemon URL:
            <input
              type="text"
              value={daemonUrl}
              onChange={(e) => setDaemonUrl(e.target.value)}
              style={{ marginLeft: '10px', width: '300px' }}
            />
          </label>
          <button
            onClick={connectToDaemon}
            disabled={isConnecting}
            style={{ marginLeft: '10px' }}
          >
            {isConnecting ? 'Connecting...' : 'Connect'}
          </button>
        </div>
        {height !== null && (
          <div>
            <p>✅ Connected - Height: {height}</p>
            <p>Transactions in Pool: {txsInPool.length}</p>
            <p>Fee Estimate: {feeEstimate ? feeEstimate.toString() : 'N/A'}</p>
          </div>
        )}
      </div>

      {/* WebAssembly Wallet Section */}
      <div style={{ marginBottom: '30px', padding: '15px', border: '1px solid #ccc', borderRadius: '5px' }}>
        <h2>WebAssembly Wallet (Full Node)</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '15px' }}>
          <label>
            Network Type:
            <select
              value={networkType as number}
              onChange={e => setNetworkType(Number(e.target.value))}
              style={{ width: '100%' }}
            >
              <option value={moneroTs.MoneroNetworkType.MAINNET}>Mainnet</option>
              <option value={moneroTs.MoneroNetworkType.TESTNET}>Testnet</option>
              <option value={moneroTs.MoneroNetworkType.STAGENET}>Stagenet</option>
            </select>
          </label>
          <label>
            Private Spend Key:
            <input
              type="text"
              value={privateSpendKey}
              onChange={(e) => setPrivateSpendKey(e.target.value)}
              style={{ width: '100%' }}
            />
          </label>
          <label>
            Restore Height:
            <input
              type="number"
              value={restoreHeight || ''}
              onChange={(e) => setRestoreHeight(Number(e.target.value))}
              style={{ width: '100%' }}
            />
          </label>
          <label>
            Username:
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={{ width: '100%' }}
            />
          </label>
          <label>
            Server Password:
            <input
              type="password"
              value={serverPassword}
              onChange={(e) => setServerPassword(e.target.value)}
              style={{ width: '100%' }}
            />
          </label>
        </div>

        <div style={{ marginBottom: '15px' }}>
          <button
            onClick={createWallet}
            disabled={isCreatingWallet}
            style={{ marginRight: '10px' }}
          >
            {isCreatingWallet ? 'Creating...' : 'Create WebAssembly Wallet'}
          </button>
        </div>

        {walletFull && (
          <div>
            <p>✅ WebAssembly Wallet Created</p>
            <p>Address: {primaryAddress}</p>
            {isSyncing && <p>🔄 {syncProgress}</p>}
            {fundsReceived && <p>💰 Funds received!</p>}
          </div>
        )}
      </div>

      {/* Transaction Operations Section */}
      <div style={{ marginBottom: '30px', padding: '15px', border: '1px solid #ccc', borderRadius: '5px' }}>
        <h2>Transaction Operations</h2>
        <div>
          <button
            onClick={createTransaction}
            disabled={!walletFull}
            style={{ marginRight: '10px' }}
          >
            Create Test Transaction
          </button>
          <button
            onClick={closeWallet}
            style={{ marginRight: '10px' }}
          >
            Close Wallet
          </button>
        </div>
        <p style={{ fontSize: '12px', color: '#666' }}>
          Note: Wallet must be created to craft transactions
        </p>
      </div>

      {/* Logs Section */}
      <div style={{ marginBottom: '30px', padding: '15px', border: '1px solid #ccc', borderRadius: '5px' }}>
        <h2>Activity Logs</h2>
        <div style={{
          height: '200px',
          overflowY: 'auto',
          backgroundColor: '#f5f5f5',
          padding: '10px',
          fontFamily: 'monospace',
          fontSize: '12px'
        }}>
          {logs.map((log, index) => (
            <div key={index}>{log}</div>
          ))}
          {logs.length === 0 && <div>No activity yet...</div>}
        </div>
      </div>
    </div>
  );
}