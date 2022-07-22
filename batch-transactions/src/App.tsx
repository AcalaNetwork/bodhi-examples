import React, {
  useCallback, useEffect, useMemo, useState,
} from 'react';
import { MaxUint256 } from '@ethersproject/constants';
import { Provider, Signer } from '@acala-network/bodhi';
import { WsProvider, SubmittableResult } from '@polkadot/api';
import { web3Enable } from '@polkadot/extension-dapp';
import type {
  InjectedExtension,
  InjectedAccount,
} from '@polkadot/extension-inject/types';
import { Input, Button, Select } from 'antd';

import {
  deployUniFactory,
  getAddLiquidityExtrinsic,
  getTokenApproveExtrinsic,
  getTokenDeployExtrinsic,
  getUniFactoryDeployExtrinsic,
  getUniRouterDeployExtrinsic,
  queryDexLiquidity,
  queryLiquidity,
  queryTokenAllowance,
  queryTokenBalance,
} from './utils';
import './App.scss';
import { handleTxResponse } from '@acala-network/eth-providers';
import { getContractAddress } from '@ethersproject/address';

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
  const [uniCoreAddress, setUniCoreAddress] = useState<string>('');
  const [uniRouterAddress, setUniRouterAddress] = useState<string>('');
  const [token0Address, setToken0Address] = useState<string>('');
  const [token1Address, setToken1Address] = useState<string>('');
  const [token0Balance, setToken0Balance] = useState<string>('');
  const [token1Balance, setToken1Balance] = useState<string>('');
  const [token0Allowance, setToken0Allowance] = useState<string>('0');
  const [token1Allowance, setToken1Allowance] = useState<string>('0');
  const [liquidity, setLiquidity] = useState<string>('');
  const [url, setUrl] = useState<string>('wss://acala-mandala.api.onfinality.io/public-ws');
  // const [url, setUrl] = useState<string>('ws://localhost:9944');

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
  // need to extract some code from signer.sendTransaction
  const deploy = useCallback(async () => {
    if (!signer || !provider) return;

    setDeploying(true);
    try {
      // TODO: save signer addr
      const evmAddr = await signer.getAddress();
      const txCount = await signer.getTransactionCount('latest');
      const predictedUniCoreAddr = getContractAddress({ from: evmAddr, nonce: txCount });

      const extrinsic1 = await getUniFactoryDeployExtrinsic(signer, evmAddr);
      const extrinsic2 = await getUniRouterDeployExtrinsic(signer, predictedUniCoreAddr);
      const extrinsic3 = await getTokenDeployExtrinsic(signer, [1000000000000]);
      const extrinsic4 = await getTokenDeployExtrinsic(signer, [2000000000000]);

      const extrinsic = await provider.api.tx.utility.batchAll([
        extrinsic1,
        extrinsic2,
        extrinsic3,
        extrinsic4,
      ]).signAsync(await signer.getSubstrateAddress());

      extrinsic.send((result: SubmittableResult) => {
        if (result.status.isFinalized || result.status.isInBlock) {
          const [addr1, addr2, addr3, addr4] = result.events.filter(
            ({ event: { section, method } }) => (section === 'evm' && method === 'Created')
          ).map(({ event }) => event.data[1].toHex());

          if (!addr1 || !addr2 || !addr3) {
            throw new Error('some perfect error handling');
          }

          setUniCoreAddress(addr1);
          setUniRouterAddress(addr2);
          setToken0Address(addr3);
          setToken1Address(addr4);

          setDeploying(false);
        } else if (result.isError) {
          throw new Error('some perfect error handling');
        }
      });
    } catch {
      setDeploying(false);
    }
  }, [signer, provider]);

  // query token balance
  useEffect(() => {
    if (!token0Address || !token1Address || !signer) return;

    (async () => {
      const evmAddr = await signer.getAddress();
      const balance0 = await queryTokenBalance(signer, token0Address, evmAddr);
      const balance1 = await queryTokenBalance(signer, token1Address, evmAddr);

      setToken0Balance(balance0);
      setToken1Balance(balance1);
    })();
  }, [token0Address, token1Address, liquidity]);

  /* ------------ Step 3: batch approve + add liquidity ------------ */
  const addLiquidity = useCallback(async () => {
    if (!signer || !provider) return;

    setCalling(true);
    try {
      const evmAddr = await signer.getAddress();
      const extrinsic1 = await getTokenApproveExtrinsic(signer, token0Address, [uniRouterAddress, MaxUint256]);
      const extrinsic2 = await getTokenApproveExtrinsic(signer, token1Address, [uniRouterAddress, MaxUint256]);
      const extrinsic3 = await getAddLiquidityExtrinsic(signer, uniRouterAddress, [
        token0Address, token1Address, 1000000, 2000000, 0, 0, evmAddr, MaxUint256,
      ], true);

      const extrinsic = await provider.api.tx.utility.batchAll([
        extrinsic1,
        extrinsic2,
        extrinsic3,
      ]).signAsync(await signer.getSubstrateAddress());

      extrinsic.send((result: SubmittableResult) => {
        if (result.status.isFinalized || result.status.isInBlock) {
          handleTxResponse(result, provider.api);   // TODO: mainly for some error check

          const failedEvent = result.events.find(
            ({ event: { section, method } }) => (section === 'evm' && method === 'ExecutedFailed')
          );

          if (failedEvent) {
            console.log('❗ tx failed');
            throw new Error(JSON.stringify(failedEvent.event.data.toHuman()));
          }

          Promise.all([
            queryLiquidity(signer, uniCoreAddress, [token0Address, token1Address]),
            queryTokenAllowance(signer, token0Address, [evmAddr, uniRouterAddress]),
            queryTokenAllowance(signer, token1Address, [evmAddr, uniRouterAddress]),
          ]).then(([liq, a0, a1]) => {
            setLiquidity(liq);
            setToken0Allowance(a0);
            setToken1Allowance(a1);

            setCalling(false);
          });
        } else if (result.isError) {
          throw new Error('some perfect error handling');
        }
      });
    } catch {
      setCalling(false);
    }
  }, [signer, provider, token0Address, token1Address]);

  // eslint-disable-next-line
  const ExtensionSelect = () => (
    <div>
      <span style={{ marginRight: 10 }}>select a polkadot wallet:</span>
      <Select
        value={ curExtension?.name }
        onChange={ targetName => setCurExtension(extensionList.find(e => e.name === targetName)) }
        disabled={ !!uniCoreAddress }
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
        disabled={ !!uniCoreAddress }
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
        <div className='step-text'>Step 2: Batch Deploy Uniswap & Tokens Contracts { uniRouterAddress && <Check /> }</div>
        <Button
          type='primary'
          disabled={ !signer || deploying || !!uniRouterAddress }
          onClick={ deploy }
        >
          { uniRouterAddress
            ? 'all contracts deploy'
            : deploying
              ? 'deploying all 4 contracts together ...'
              : 'batch deploy'}
        </Button>

        { uniRouterAddress && (
          <>
            <div>Uni Core address: <span className='address'>{ uniCoreAddress }</span></div>
            <div>Uni Router address: <span className='address'>{ uniRouterAddress }</span></div>
            <div>TokenA address: <span className='address'>{ token0Address }</span></div>
            <div>TokenB address: <span className='address'>{ token1Address }</span></div>
            <div>TokenA balance: <span className='address'>{ token0Balance }</span></div>
            <div>TokenB balance: <span className='address'>{ token1Balance }</span></div>
            <div>TokenA allowance: <span className='address'>{ token0Allowance }</span></div>
            <div>TokenB allowance: <span className='address'>{ token1Allowance }</span></div>
          </>
        )}
      </section>

      { /* ------------------------------ Step 3 ------------------------------*/}
      <section className='step'>
        <div className='step-text'>Step 3: Batch Approve & Add Liquidity { liquidity !== '' && <Check /> }</div>
        <Button
          type='primary'
          disabled={ uniRouterAddress === '' || liquidity !== '' }
          onClick={ addLiquidity }
        >
          { liquidity !== ''
            ? 'liquidity added'
            : calling
              ? 'sending batch calls ...'
              : 'approve tokens + add liquidity'}
        </Button>

        { liquidity !== '' && (
          <>
            <div>TokenA balance: <span className='address'>{ token0Balance }</span></div>
            <div>TokenB balance: <span className='address'>{ token1Balance }</span></div>
            <div>Dex liquidity: <span className='address'>{ liquidity }</span></div>
            <div>TokenA allowance: <span className='address'>{ token0Allowance }</span></div>
            <div>TokenB allowance: <span className='address'>{ token1Allowance }</span></div>
          </>
        )}
      </section>

      { liquidity !== '' && (
        <section className='step' id='congrats'>
          <div>Congratulations 🎉🎉</div>
          <div>You have succesfully setup uniswap with <span className='decorate'>ONE</span> signature</div>
          <div>Interacted with contracts via <span className='decorate'>BATCH</span> transations</div>
          <div>Powered by <span className='decorate'>Acala EVM+</span></div>
          {/* <Button
            id='next-level'
            type='primary'
            onClick={ () => window.open('https://github.com/AcalaNetwork/bodhi-examples/tree/master/batch-transactions', '_blank') }
          >
            Take Me To Advanced Example (Coming Soon)
          </Button> */}
        </section>
      )}
    </div>
  );
}

export default App;
