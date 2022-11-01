import React, {
  useCallback, useEffect, useMemo, useState,
} from 'react';
import { Provider, Signer } from '@acala-network/bodhi';
import { WsProvider } from '@polkadot/api';
import { web3Enable } from '@polkadot/extension-dapp';
import type {
  InjectedExtension,
  InjectedAccount,
} from '@polkadot/extension-inject/types';
import { ContractFactory, Contract } from 'ethers';
import { Input, Button, Select } from 'antd';
import echoContract from './Echo.json';

import './App.scss';

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
  const [deployedAddress, setDeployedAddress] = useState<string>('');
  const [echoInput, setEchoInput] = useState<string>('calling an EVM+ contract with polkadot wallet!');
  const [echoMsg, setEchoMsg] = useState<string>('');
  const [newEchoMsg, setNewEchoMsg] = useState<string>('');
  const [url, setUrl] = useState<string>('wss://mandala-rpc.aca-staging.network/ws');
  // const [url, setUrl] = useState<string>('ws://localhost:9944');

  /* ------------ Step 1: connect to chain node with a provider ------------ */
  const connectProvider = useCallback(async (nodeUrl: string) => {
    setConnecting(true);
    try {
      const signerProvider = new Provider({
        provider: new WsProvider(nodeUrl.trim()),
      });

      await signerProvider.isReady();

      setProvider(signerProvider);
    } catch (error) {
      console.error(error);
      setProvider(null);
    } finally {
      setConnecting(false);
    }
  }, []);

  /* ------------ Step 2: connect polkadot wallet ------------ */
  const connectWallet = useCallback(async () => {
    const allExtensions = await web3Enable('bodhijs-example');
    setExtensionList(allExtensions);
    setCurExtension(allExtensions[0]);
  }, []);

  useEffect(() => {
    curExtension?.accounts.get().then(result => {
      setAccountList(result);
      setSelectedAddress(result[0].address || '');
    });
  }, [curExtension]);

  /* ----------
     Step 2.1: create a bodhi signer from provider and extension signer
                                                             ---------- */
  const signer = useMemo(() => {
    if (!provider || !curExtension || !selectedAddress) return null;
    return new Signer(provider, selectedAddress, curExtension.signer);
  }, [provider, curExtension, selectedAddress]);

  /* ----------
     Step 2.2: locad some info about the account such as:
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

  /* ------------ Step 3: deploy contract ------------ */
  const deploy = useCallback(async () => {
    if (!signer) return;

    setDeploying(true);
    try {
      const factory = new ContractFactory(echoContract.abi, echoContract.bytecode, signer);

      const contract = await factory.deploy();
      const echo = await contract.echo();

      setDeployedAddress(contract.address);
      setEchoMsg(echo);
    } finally {
      setDeploying(false);
    }
  }, [signer]);

  /* ------------ Step 4: call contract ------------ */
  const callContract = useCallback(async (msg: string) => {
    if (!signer) return;
    setCalling(true);
    setNewEchoMsg('');
    try {
      const instance = new Contract(deployedAddress, echoContract.abi, signer);

      await instance.scream(msg);
      const newEcho = await instance.echo();

      setNewEchoMsg(newEcho);
    } finally {
      setCalling(false);
    }
  }, [signer, deployedAddress]);

  // eslint-disable-next-line
  const ExtensionSelect = () => (
    <div>
      <span style={{ marginRight: 10 }}>select a polkadot wallet:</span>
      <Select
        value={ curExtension?.name }
        onChange={ targetName => setCurExtension(extensionList.find(e => e.name === targetName)) }
        disabled={ !!deployedAddress }
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
        disabled={ !!deployedAddress }
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
        <div className='step-text'>Step 1: Connect Chain Node { provider && <Check /> }</div>
        <Input
          type='text'
          disabled={ connecting || !!provider }
          value={ url }
          onChange={ e => setUrl(e.target.value) }
          addonBefore='node url'
        />
        <Button
          type='primary'
          onClick={ () => connectProvider(url) }
          disabled={ connecting || !!provider }
        >
          { connecting
            ? 'connecting ...'
            : provider
              ? `connected to ${provider.api.runtimeChain.toString()}`
              : 'connect' }
        </Button>
      </section>

      { /* ------------------------------ Step 2 ------------------------------*/}
      <section className='step'>
        <div className='step-text'>Step 2: Connect Polkadot Wallet { signer && <Check />  }</div>
        <div>
          <Button
            type='primary'
            onClick={ connectWallet }
            disabled={ !provider || !!signer }
          >
            {curExtension
              ? `connected to ${curExtension.name}/${curExtension.version}`
              : 'connect'}
          </Button>

          { !!extensionList?.length && <ExtensionSelect /> }
          { !!accountList?.length && <AccountSelect /> }
        </div>

        {signer && (
          <div>
            {loadingAccount
              ? 'loading account info ...'
              : claimedEvmAddress
                ? (<div>claimed evm address: <span className='address'>{claimedEvmAddress}</span></div>)
                : (<div>default evm address: <span className='address'>{signer.computeDefaultEvmAddress()}</span></div>)}
            { balance && (<div>account balance: <span className='address'>{ balance }</span></div>) }
          </div>
        )}
      </section>

      { /* ------------------------------ Step 3 ------------------------------*/}
      <section className='step'>
        <div className='step-text'>Step 3: Deploy Echo Contract { deployedAddress && <Check /> }</div>
        <Button
          type='primary'
          disabled={ !signer || deploying || !!deployedAddress }
          onClick={ deploy }
        >
          { deployedAddress
            ? 'contract deployed'
            : deploying
              ? 'deploying ...'
              : 'deploy'}
        </Button>

        {deployedAddress && (
          <>
            <div>contract address: <span className='address'>{deployedAddress}</span></div>
            <div>initial echo messge: <span className='address'>{echoMsg}</span></div>
          </>
        )}
      </section>

      { /* ------------------------------ Step 4 ------------------------------*/}
      <section className='step'>
        <div className='step-text'>Step 4: Call Contract To Change Echo Msg { newEchoMsg && <Check /> }</div>
        <Input
          type='text'
          disabled={ !signer || !deployedAddress || calling }
          value={ echoInput }
          onChange={ e => setEchoInput(e.target.value) }
          addonBefore='new msg'
        />
        <Button
          type='primary'
          disabled={ !signer || !deployedAddress || calling }
          onClick={ () => callContract(echoInput) }
        >
          { calling
            ? 'sending tx ...'
            : 'call'}
        </Button>

        {newEchoMsg && (
          <div>new echo messge: <span className='address'>{newEchoMsg}</span></div>
        )}
      </section>

      {newEchoMsg && (
        <section className='step' id='congrats'>
          <div>Congratulations 🎉🎉</div>
          <div>You have succesfully deployed and called an EVM+ contract with <span className='cross'>metamask</span><span className='decorate'>polkadot wallet</span></div>
          <Button
            id='next-level'
            type='primary'
            onClick={ () => window.open('https://github.com/AcalaNetwork/bodhi-examples/tree/master/batch-transactions', '_blank') }
          >
            Take Me To Advanced Example
          </Button>
        </section>
      )}
    </div>
  );
}

export default App;
