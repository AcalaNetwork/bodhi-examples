import React, {
  useCallback, useEffect, useMemo, useState,
} from 'react';
import { Provider, Signer } from '@acala-network/bodhi';
import { handleTxResponse } from '@acala-network/eth-providers/lib';
import { TransactionReceipt } from '@ethersproject/abstract-provider';
import { WsProvider, SubmittableResult } from '@polkadot/api';
import { web3Enable } from '@polkadot/extension-dapp';
import type {
  InjectedExtension,
  InjectedAccount,
} from '@polkadot/extension-inject/types';
import { ContractFactory, Contract } from 'ethers';
import { Input, Button, Select } from 'antd';
import dexContract from './Dex.json';

import './App.scss';
import { toBN } from './utils';
import { ISubmittableResult } from '@polkadot/types/types';
import { SubmittableExtrinsic } from '@polkadot/api-base/types';

const { Option } = Select;

const Check = () => (<span className='check'>✓</span>);

function App() {
  /* ---------- extensions ---------- */
  const [extensionList, setExtensionList] = useState<InjectedExtension[]>([]);
  const [curExtension, setCurExtension] = useState<InjectedExtension | undefined>(undefined);
  const [accountList, setAccountList] = useState<InjectedAccount[]>([]);

  /* ---------- status flags ---------- */
  const [connecting, setConnecting] = useState(false);
  const [loadingAccount, setLoadingAccountInfo] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [calling, setCalling] = useState(false);

  /* ---------- data ---------- */
  const [provider, setProvider] = useState<Provider | null>(null);
  const [selectedAddress, setSelectedAddress] = useState<string>('');
  const [claimedEvmAddress, setClaimedEvmAddress] = useState<string>('');
  const [balance, setBalance] = useState<string>('');
  const [dexAddress, setDexAddress] = useState<string>('');
  const [tokenAAddress, setTokenAAddress] = useState<string>('');
  const [tokenBAddress, setTokenBAddress] = useState<string>('');
  // const [url, setUrl] = useState<string>('wss://acala-mandala.api.onfinality.io/public-ws');
  const [url, setUrl] = useState<string>('ws://localhost:9944');

  /* ------------
    Step 1:
      - connect to chain node with a provider
      - connect polkadot wallet
                                 ------------ */
  const connectProviderAndWallet = useCallback(async (nodeUrl: string) => {
    setConnecting(true);
    try {
      // connect provider
      const signerProvider = new Provider({
        provider: new WsProvider(nodeUrl.trim()),
      });
      await signerProvider.isReady();
      setProvider(signerProvider);

      // connect wallet
      const allExtensions = await web3Enable('bodhijs-example');
      setExtensionList(allExtensions);
      setCurExtension(allExtensions[0]);
    } catch (error) {
      console.error(error);
      setProvider(null);
    } finally {
      setConnecting(false);
    }
  }, []);

  useEffect(() => {
    curExtension?.accounts.get().then(result => {
      setAccountList(result);
      setSelectedAddress(result[0].address || '');
    });
  }, [curExtension]);

  /* ----------
     Step 1.1: create a bodhi signer from provider and extension signer
                                                             ---------- */
  const signer = useMemo(() => {
    if (!provider || !curExtension || !selectedAddress) return null;
    return new Signer(provider, selectedAddress, curExtension.signer);
  }, [provider, curExtension, selectedAddress]);

  /* ----------
     Step 1.2: locad some info about the account such as:
     - bound/default evm address
     - balance
     - whatever needed
                                               ---------- */
  useEffect(() => {
    (async function fetchAccountInfo() {
      if (!signer) return;

      setLoadingAccountInfo(true);
      try {
        const [evmAddress, accountBalance] = await Promise.all([
          signer.queryEvmAddress(),
          signer.getBalance(),
        ]);
        setBalance(accountBalance.toString());
        setClaimedEvmAddress(evmAddress);
      } catch (error) {
        console.error(error);
        setClaimedEvmAddress('');
        setBalance('');
      } finally {
        setLoadingAccountInfo(false);
      }
    }());
  }, [signer]);

  /* ------------ Step 2: deploy contract ------------ */
  // need to extra some code from signer.sendTransaction
  const getDexDeployExtrinsic = useCallback(async (signer, provider) => {
    const [signerAddress, evmAddress] = await Promise.all([
      signer.getSubstrateAddress(),
      signer.getAddress(),
    ]);

    const factory = new ContractFactory(dexContract.abi, dexContract.bytecode, signer);

    const tx = await signer.populateTransaction({
      ...factory.getDeployTransaction(),
      from: evmAddress,
    });

    const {
      gas: gasLimit,
      storage: storageLimit,
    } = await provider.estimateResources(tx);

    const extrinsic = provider.api.tx.evm.create(
      tx.data,
      toBN(tx.value),
      toBN(gasLimit),
      toBN(storageLimit.isNegative() ? 0 : storageLimit),
      tx.accessList || []
    );

    return extrinsic;
  }, []);

  const deploy = useCallback(async () => {
    if (!signer || !provider) return;

    setDeploying(true);
    try {
      const extrinsic1 = await getDexDeployExtrinsic(signer, provider);
      const extrinsic2 = await getDexDeployExtrinsic(signer, provider);

      const extrinsic = await provider.api.tx.utility.batchAll([
        extrinsic1,
        extrinsic2,
      ]).signAsync(await signer.getSubstrateAddress());

      // const txHash1 = extrinsic1.hash.toHex();
      // const txHash2 = extrinsic2.hash.toHex();

      const {
        contractAddr1,
        contractAddr2,
      } = await new Promise<{
        contractAddr1: string,
        contractAddr2: string,
      }>((resolve, reject) => {
        extrinsic.send((result: SubmittableResult) => {
          if (result.status.isFinalized || result.status.isInBlock) {
            const [contractAddr1, contractAddr2] = result.events.filter(({ event: { section, method } }) => {
              return section === 'evm' && method === 'Created';
            }).map(({ event }) => event.data[1].toHex());

            // TODO: error handling
            resolve({
              contractAddr1,
              contractAddr2,
            });
          } else if (result.isError) {
            reject({ result });
          }
        });
      });

      console.log({
        contractAddr1,
        contractAddr2,
      });

      setDexAddress(contractAddr1);
      setTokenAAddress(contractAddr2);
      setTokenBAddress(contractAddr2);
    } finally {
      setDeploying(false);
    }
  }, [signer, provider]);

  /* ------------ Step 4: call contract ------------ */
  // const callContract = useCallback(async (msg: string) => {
  //   if (!signer) return;
  //   setCalling(true);
  //   setNewEchoMsg('');
  //   try {
  //     const instance = new Contract(dexAddress, dexContract.abi, signer);

  //     await instance.scream(msg);
  //     const newEcho = await instance.echo();

  //     setNewEchoMsg(newEcho);
  //   } finally {
  //     setCalling(false);
  //   }
  // }, [signer, dexAddress]);

  // eslint-disable-next-line
  const ExtensionSelect = () => (
    <div>
      <span style={{ marginRight: 10 }}>select a polkadot wallet:</span>
      <Select
        value={ curExtension?.name }
        onChange={ targetName => setCurExtension(extensionList.find(e => e.name === targetName)) }
        disabled={ !!dexAddress }
      >
        {extensionList.map(ex => (
          <Option key={ ex.name } value={ ex.name }>
            {`${ex.name}/${ex.version}`}
          </Option>
        ))}
      </Select>
    </div>
  );

  // eslint-disable-next-line
  const AccountSelect = () => (
    <div>
      <span style={{ marginRight: 10 }}>account:</span>
      <Select
        value={ selectedAddress }
        onChange={ value => setSelectedAddress(value) }
        disabled={ !!dexAddress }
      >
        {accountList.map(account => (
          <Option key={ account.address } value={ account.address }>
            {account.name} / {account.address}
          </Option>
        ))}
      </Select>
    </div>
  );

  return (
    <div id='app'>
      { /* ------------------------------ Step 1 ------------------------------*/ }
      <section className='step'>
        <div className='step-text'>Step 1: Connect Chain & Polkadot Wallet { provider && <Check /> }</div>
        <Input
          type='text'
          disabled={ connecting || !!provider }
          value={ url }
          onChange={ e => setUrl(e.target.value) }
          addonBefore='node url'
        />

        <Button
          type='primary'
          onClick={ () => connectProviderAndWallet(url) }
          disabled={ connecting || !!provider }
        >
          {connecting
            ? 'connecting ...'
            : provider
              ? `connected to ${provider.api.runtimeChain.toString()}`
              : 'connect'}
        </Button>

        {!!extensionList?.length && <ExtensionSelect />}
        {!!accountList?.length && <AccountSelect />}

        {signer && (
          <div>
            {loadingAccount
              ? 'loading account info ...'
              : claimedEvmAddress
                ? (<div>claimed evm address: <span className='address'>{claimedEvmAddress}</span></div>)
                : (<div>default evm address: <span className='address'>{signer.computeDefaultEvmAddress()}</span></div>)}
            {balance && (<div>account balance: <span className='address'>{balance}</span></div>)}
          </div>
        )}
      </section>

      { /* ------------------------------ Step 2 ------------------------------*/}
      <section className='step'>
        <div className='step-text'>Step 2: Batch Deploy 3 Contracts { dexAddress && <Check /> }</div>
        <Button
          type='primary'
          disabled={ !signer || deploying || !!dexAddress }
          onClick={ deploy }
        >
          { dexAddress
            ? 'contract deployed'
            : deploying
              ? 'deploying ...'
              : 'deploy'}
        </Button>

        {dexAddress && (<>
          <div>Dex address: <span className='address'>{ dexAddress }</span></div>
          <div>TokenA address: <span className='address'>{ tokenAAddress }</span></div>
          <div>TokenB address: <span className='address'>{ tokenBAddress }</span></div>
        </>)}
      </section>

      {false && (
        <section className='step' id='congrats'>
          <div>Congratulations 🎉🎉</div>
          <div>You have succesfully deployed and called an EVM+ contract with <span className='cross'>metamask</span><span className='decorate'>polkadot wallet</span></div>
          <Button
            id='next-level'
            type='primary'
            onClick={ () => window.open('https://github.com/AcalaNetwork/bodhi-examples/tree/master/batch-transactions', '_blank') }
          >
            Take Me To Advanced Example (Coming Soon)
          </Button>
        </section>
      )}
    </div>
  );
}

export default App;
