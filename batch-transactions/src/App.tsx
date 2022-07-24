import React, {
  useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState,
} from 'react';
import { WsProvider, SubmittableResult } from '@polkadot/api';
import { web3Enable } from '@polkadot/extension-dapp';
import type {
  InjectedExtension,
  InjectedAccount,
} from '@polkadot/extension-inject/types';
import { Provider, Signer } from '@acala-network/bodhi';
import { handleTxResponse } from '@acala-network/eth-providers';
import { getContractAddress } from '@ethersproject/address';
import { MaxUint256 } from '@ethersproject/constants';
import { formatUnits } from 'ethers/lib/utils';
import { Input, Button, Select } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined, StarOutlined } from '@ant-design/icons';
import Confetti from 'react-confetti';

import {
  diff,
  getAddLiquidityExtrinsic,
  getTokenApproveExtrinsic,
  getTokenDeployExtrinsic,
  getUniFactoryDeployExtrinsic,
  getUniRouterDeployExtrinsic,
  queryLiquidity,
  queryTokenAllowance,
  queryTokenBalance,
} from './utils';
import './App.scss';

const { Option } = Select;

const Check = () => (<span className='check'>✓</span>);

function App() {
  /* ---------- extensions ---------- */
  const [extensionList, setExtensionList] = useState<InjectedExtension[]>([]);
  const [curExtension, setCurExtension] = useState<InjectedExtension | undefined>(undefined);
  const [accountList, setAccountList] = useState<InjectedAccount[]>([]);
  const [provider, setProvider] = useState<Provider | null>(null);

  /* ---------- status flags ---------- */
  const [connecting, setConnecting] = useState(false);
  const [loadingAccount, setLoadingAccountInfo] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [calling, setCalling] = useState(false);
  const [recycling, setRecycling] = useState(false);
  const [finalStep, setFinalStep] = useState(false);
  const [finished, setFinished] = useState(false);

  /* ---------- data ---------- */
  const [balance, setBalance] = useState<string[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<string>('');
  const [evmAddress, setEvmAddress] = useState<string>('');
  const [uniCoreAddress, setUniCoreAddress] = useState<string>('');
  const [uniRouterAddress, setUniRouterAddress] = useState<string>('');
  const [token0Address, setToken0Address] = useState<string>('');
  const [token1Address, setToken1Address] = useState<string>('');
  const [input0, setInput0] = useState<string>('123456');
  const [input1, setInput1] = useState<string>('888888');
  const [liquidity, setLiquidity] = useState<string>('0');
  const [url, setUrl] = useState<string>('wss://acala-mandala.api.onfinality.io/public-ws');
  // const [url, setUrl] = useState<string>('ws://localhost:9944');

  // init data
  const [token0Balance, setToken0Balance] = useState<string>('');
  const [token1Balance, setToken1Balance] = useState<string>('');
  const [token0Allowance, setToken0Allowance] = useState<string>('');
  const [token1Allowance, setToken1Allowance] = useState<string>('');

  // updated data after batch call
  const [token0NewBalance, setToken0NewBalance] = useState<string>('');
  const [token1NewBalance, setToken1NewBalance] = useState<string>('');
  const [token0NewAllowance, setToken0NewAllowance] = useState<string>('');
  const [token1NewAllowance, setToken1NewAllowance] = useState<string>('');

  const congratsEle = useRef<HTMLElement>();
  const recycleEle = useRef<HTMLElement>();

  useLayoutEffect(() => {
    if (recycleEle.current) {
      recycleEle.current.scrollIntoView({ behavior: 'smooth' });
    } else if (congratsEle.current) {
      congratsEle.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [liquidity, finalStep]);

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
     Step 1.2: load some info about the account such as:
     - bound/default evm address
     - balance
     - whatever needed
                                               ---------- */
  useEffect(() => {
    (async function fetchAccountInfo() {
      if (!signer) return;

      setLoadingAccountInfo(true);
      try {
        const [evmAddr, accountBalance] = await Promise.all([
          signer.getAddress(),
          signer.getBalance(),
        ]);

        setBalance([formatUnits(accountBalance)]);
        setEvmAddress(evmAddr);
      } catch (error) {
        console.error(error);
        setEvmAddress('');
      } finally {
        setLoadingAccountInfo(false);
      }
    }());
  }, [signer]);

  /* ------------ Step 2: deploy contracts ------------ */
  const deploy = useCallback(async () => {
    if (!signer || !provider) return;

    setDeploying(true);
    try {
      /* ----------
        Step 2.1:
          - construct each of the contract deployment extrinsic
          - batch them into a single `batchAll` extrinsic
                                                     ---------- */
      const txCount = await signer.getTransactionCount('latest');
      const predictedUniCoreAddr = getContractAddress({ from: evmAddress, nonce: txCount });

      const deployExtrinsics = await Promise.all([
        getUniFactoryDeployExtrinsic(signer, evmAddress),
        getUniRouterDeployExtrinsic(signer, predictedUniCoreAddr),
        getTokenDeployExtrinsic(signer, [1000000]),
        getTokenDeployExtrinsic(signer, [2000000]),
      ]);

      const batchDeploy = provider.api.tx.utility.batchAll(deployExtrinsics);

      /* ----------
         Step 2.2:
           - sign and send the `batchAll` extrinsic
           - handle result in the callback function
                                         ---------- */
      await batchDeploy.signAndSend(selectedAddress, (result: SubmittableResult) => {
        if (result.status.isInBlock) {
          // this is mainly for some error checking
          handleTxResponse(result, provider.api).catch(err => {
            console.log('❗ tx failed');
            throw err;
          });

          const [uniCoreAddr, uniRouterAddr, token0Addr, token1Addr] = result.events.filter(
            ({ event: { section, method } }) => (section === 'evm' && method === 'Created')
          )
            .map(({ event }) => event.data[1].toHex());

          if (!uniCoreAddr || !uniRouterAddr || !token0Addr || !token1Addr) {
            throw new Error('some perfect error handling');
          }

          // query token balance and allowance
          Promise.all([
            queryTokenBalance(signer, token0Addr, evmAddress),
            queryTokenBalance(signer, token1Addr, evmAddress),
            queryTokenAllowance(signer, token0Addr, [evmAddress, uniRouterAddr]),
            queryTokenAllowance(signer, token1Addr, [evmAddress, uniRouterAddr]),
            signer.getBalance(),
          ]).then(([b0, b1, a0, a1, bal]) => {
            setToken0Balance(b0);
            setToken1Balance(b1);
            setToken0Allowance(a0);
            setToken1Allowance(a1);
            setBalance(prev => prev.concat(formatUnits(bal)));
            setDeploying(false);
          });

          setUniCoreAddress(uniCoreAddr);
          setUniRouterAddress(uniRouterAddr);
          setToken0Address(token0Addr);
          setToken1Address(token1Addr);
        } else if (result.isError) {
          throw new Error('some perfect error handling');
        }
      });
    } catch (err) {
      console.log(err);
      setDeploying(false);
    }
  }, [signer, provider, evmAddress]);

  /* ------------ Step 3: batch approve + add liquidity ------------ */
  const addLiquidity = useCallback(async () => {
    if (!signer || !provider) return;

    setCalling(true);
    try {
      /* ----------
        Step 3.1:
          - construct each of the contract call extrinsic
          - batch them into a single `batchAll` extrinsic
                                                     ---------- */
      const callExtrinsics = await Promise.all([
        getTokenApproveExtrinsic(signer, token0Address, [uniRouterAddress, MaxUint256]),
        getTokenApproveExtrinsic(signer, token1Address, [uniRouterAddress, MaxUint256]),
        getAddLiquidityExtrinsic(signer, uniRouterAddress, [
          token0Address, token1Address, input0, input1, 0, 0, evmAddress, MaxUint256,
        ], true),
      ]);

      const batchCall = provider.api.tx.utility.batchAll(callExtrinsics);

      /* ----------
         Step 3.2:
           - sign and send the `batchAll` extrinsic
           - handle result in the callback function
                                         ---------- */
      await batchCall.signAndSend(selectedAddress, (result: SubmittableResult) => {
        if (result.status.isInBlock) {
          // this is mainly for some error checking
          handleTxResponse(result, provider.api).catch(err => {
            console.log('❗ tx failed');
            throw err;
          });

          // query pool liquidity, token balance and allowance
          Promise.all([
            queryLiquidity(signer, uniCoreAddress, [token0Address, token1Address]),
            queryTokenBalance(signer, token0Address, evmAddress),
            queryTokenBalance(signer, token1Address, evmAddress),
            queryTokenAllowance(signer, token0Address, [evmAddress, uniRouterAddress]),
            queryTokenAllowance(signer, token1Address, [evmAddress, uniRouterAddress]),
            signer.getBalance(),
          ]).then(([liq, b0, b1, a0, a1, bal]) => {
            setLiquidity(liq);
            setToken0NewBalance(b0);
            setToken1NewBalance(b1);
            setToken0NewAllowance(a0);
            setToken1NewAllowance(a1);
            setBalance(prev => prev.concat(formatUnits(bal)));
            setCalling(false);
          });
        } else if (result.isError) {
          throw new Error('some perfect error handling');
        }
      });
    } catch (err) {
      console.log(err);
      setCalling(false);
    }
  }, [signer, provider, token0Address, token1Address, input0, input1]);

  /* ------------ Hidden Step: recycle all contracts ------------ */
  const recycle = useCallback(async () => {
    if (!signer || !provider) return;

    setRecycling(true);
    try {
      const recycleExtrinsics = await Promise.all([
        provider.api.tx.evm.selfdestruct(uniCoreAddress),
        provider.api.tx.evm.selfdestruct(uniRouterAddress),
        provider.api.tx.evm.selfdestruct(token0Address),
        provider.api.tx.evm.selfdestruct(token1Address),
      ]);

      const batchCall = provider.api.tx.utility.batchAll(recycleExtrinsics);

      await batchCall.signAndSend(selectedAddress, (result: SubmittableResult) => {
        if (result.status.isInBlock) {
          // this is mainly for some error checking
          handleTxResponse(result, provider.api).catch(err => {
            console.log('❗ tx failed');
            throw err;
          });

          const i = setInterval(() => {
            signer.getBalance().then(bal => {
              console.log('check balance', formatUnits(bal), balance[2]);
              const balanceUpdated = Number(formatUnits(bal).split('.')[0]) > Number(balance[2].split('.')[0]);
              if (balanceUpdated) {
                setBalance(prev => prev.concat(formatUnits(bal)));
                setRecycling(false);
                setFinished(true);

                clearInterval(i);
              }
            });
          }, 2000);
        } else if (result.isError) {
          throw new Error('some perfect error handling');
        }
      });
    } catch (err) {
      console.log(err);
      setRecycling(false);
    }
  }, [signer, provider, uniCoreAddress, uniRouterAddress, token0Address, token1Address, balance]);

  // eslint-disable-next-line
  const ExtensionSelect = () => (
    <div>
      <span style={{ marginRight: 10 }}>select a polkadot wallet:</span>
      <Select
        value={ curExtension?.name }
        onChange={ targetName => setCurExtension(extensionList.find(e => e.name === targetName)) }
        disabled={ !!uniCoreAddress }
      >
        { extensionList.map(ex => (
          <Option key={ ex.name } value={ ex.name }>
            { `${ex.name}/${ex.version}` }
          </Option>
        )) }
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
        { accountList.map(account => (
          <Option key={ account.address } value={ account.address }>
            { account.name } / { account.address }
          </Option>
        )) }
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
          { connecting
            ? <><StarOutlined spin /> connecting ...</>
            : provider
              ? `connected to ${provider.api.runtimeChain.toString()} 🎉`
              : 'connect' }
        </Button>

        { !!extensionList?.length && <ExtensionSelect /> }
        { !!accountList?.length && <AccountSelect /> }

        { signer && (
          <div>
            { loadingAccount
              ? 'loading account info ...'
              : <div>claimed/default evm address: <span className='grayLight'>{ evmAddress }</span></div> }
            { balance[0] && <div>account balance: <span className='grayLight'>{ balance[0] }</span></div> }
          </div>
        ) }
      </section>

      { /* ------------------------------ Step 2 ------------------------------*/ }
      <section className='step'>
        <div className='step-text'>Step 2: Batch Deploy Uniswap & Tokens Contracts { uniRouterAddress && <Check /> }</div>
        <Button
          type='primary'
          disabled={ !signer || deploying || !!uniRouterAddress }
          onClick={ deploy }
        >
          { uniRouterAddress
            ? 'all contracts deployed 🎉'
            : deploying
              ? <><StarOutlined spin /> deploying 4 contracts together ...</>
              : 'batch deploy' }
        </Button>

        { uniRouterAddress && (
          <>
            <div>uni core address: <span className='grayLight'>{ uniCoreAddress }</span></div>
            <div>uni router address: <span className='grayLight'>{ uniRouterAddress }</span></div>
            <div>tokenA address: <span className='grayLight'>{ token0Address }</span></div>
            <div>tokenB address: <span className='grayLight'>{ token1Address }</span></div>
            <div>tokenA balance: <span className='grayLight'>{ token0Balance }</span></div>
            <div>tokenB balance: <span className='grayLight'>{ token1Balance }</span></div>
            <div>tokenA allowance: <span className='grayLight'>{ token0Allowance }</span></div>
            <div>tokenB allowance: <span className='grayLight'>{ token1Allowance }</span></div>
            <div>dex liquidity: <span className='grayLight'>0x00</span></div>
            { balance[1] && <div>account balance: <span className='grayLight'>{ balance[1] }</span><span className='redLight'><ArrowDownOutlined /> { diff(balance[0], balance[1]) }</span></div> }
          </>
        ) }
      </section>

      { /* ------------------------------ Step 3 ------------------------------*/ }
      <section className='step'>
        <div className='step-text'>Step 3: Batch Approve & Add Liquidity { liquidity !== '0' && <Check /> }</div>
        <Input
          type='text'
          disabled={ uniRouterAddress === '' || calling || liquidity !== '0' }
          value={ input0 }
          onChange={ e => setInput0(e.target.value) }
          addonBefore='token A amount'
        />
        <Input
          type='text'
          disabled={ uniRouterAddress === '' || calling || liquidity !== '0' }
          value={ input1 }
          onChange={ e => setInput1(e.target.value) }
          addonBefore='token B amount'
        />
        <Button
          type='primary'
          disabled={ uniRouterAddress === '' || calling || liquidity !== '0' }
          onClick={ addLiquidity }
        >
          { liquidity !== '0'
            ? 'liquidity added 🎉'
            : calling
              ? <><StarOutlined spin /> processing batch calls ...</>
              : 'approve tokens + add liquidity' }
        </Button>

        { liquidity !== '0' && (
          <>
            <div>tokenA balance: <span className='grayLight'>{ token0NewBalance }</span><span className='redLight'><ArrowDownOutlined /> { diff(token0Balance, token0NewBalance) }</span></div>
            <div>tokenB balance: <span className='grayLight'>{ token1NewBalance }</span><span className='redLight'><ArrowDownOutlined /> { diff(token1Balance, token1NewBalance) }</span></div>
            <div>tokenA allowance: <span className='grayLight'>{ token0NewAllowance }</span><span className='greenLight'><ArrowUpOutlined /> ♾️</span></div>
            <div>tokenB allowance: <span className='grayLight'>{ token1NewAllowance }</span><span className='greenLight'><ArrowUpOutlined /> ♾️</span></div>
            <div>dex liquidity: <span className='grayLight'>{ liquidity }</span><span className='greenLight'><ArrowUpOutlined /> { liquidity }</span></div>
            <div>account balance: <span className='grayLight'>{ balance[2] || 'loading...' }</span>
              { balance[2] && <span className='redLight'><ArrowDownOutlined /> { diff(balance[1], balance[2]) }</span> }
            </div>
          </>
        ) }
      </section>

      { /* ------------------------------ Hidden Step ------------------------------*/ }
      { liquidity !== '0' && (
        <section className='step' id='congrats' ref={ congratsEle }>
          <div>Congratulations 🎉🎉</div>
          <div>You have succesfully deployed uniswap and tokens with <span className='decorate'>ONE</span> signature</div>
          <div>and interacted with them via <span className='decorate'>BATCH</span> contract calls</div>
          <div>Powered by <span className='decorate'>Acala EVM+</span></div>

          <br />
          <Button
            type='primary'
            disabled={ finalStep }
            onClick={ () => setFinalStep(true) }
          >
            take me to secret bonus step
          </Button>

          <Confetti
            style={{
              position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
            }}
            numberOfPieces={ 1000 }
            tweenDuration={ 20000 }
            gravity={ 0.1 }
            recycle={ false }
          />
        </section>
      ) }

      { finalStep && (
        <section className='step' ref={ recycleEle }>
          <div className='step-text'>Batch Recycle Contracts & Take Back My ACA { finished && <Check /> }</div>
          <Button
            type='primary'
            disabled={ recycling || finished }
            onClick={ recycle }
          >
            { recycling
              ? <><StarOutlined spin /> recycling contracts, this might take a while ...</>
              : finished
                ? 'all contracts recycled 🎉'
                : 'bye uniswap 😭' }
          </Button>

          <div>account balance: <span className='grayLight'>{ balance[2] }</span></div>
          { finished && (
            <div>final account balance: <span className='grayLight'>{ balance[3] }</span><span className='greenLight'><ArrowUpOutlined /> { diff(balance[3], balance[2]) }</span></div>
          ) }
        </section>
      ) }
    </div>
  );
}

export default App;
