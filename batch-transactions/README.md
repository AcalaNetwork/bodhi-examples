# Bodhi.js Example - Batch Transactions
One of the advanced feature of EVM+, compared to traditional EVM, is the ability to do batch transaction.

This example will show how to batch transactions with polkadot wallet and [bodhi.js](https://github.com/AcalaNetwork/bodhi.js/)，so users can deploy multiple contracts at once, and perform `approve token` and `add liquidity` transactions within a single transaction.

## Run
- start a dev server: `yarn dev`
- build: `yarn build`
- lint: `yarn lint`

## Details
### Step 1: connet chain node and polkadot wallet
This is covered in basic tutorial so we will skip this part.

### Step 2: batch deploy contracts
In this step we will deploy 4 contracts together:
- uniswap core
- uniswap router
- erc20 token A
- erc20 token B

**key point 1**: since traditional evm doesn't have batch feature, existing tools (such as ethers Contract) doesn't support it directly. So we will need to do some manual construction of each evm transaction as `extrinsic`, which is the polkadot way of saying `transaction`.

In order to achieve this, we have generalized two factory helpers (might export from bodhi in the future, but let's use them directly for now : )
- `getDeployExtrinsic`: factory to construct deploy extrinsic
- `getCallExtrinsic`: factory to construct contract call extrinsic

using these factory, we can easily construct a couple methods for contract deployment.
```ts
export const getUniFactoryDeployExtrinsic = async (signer: Signer, deployer: string) => (
  getDeployExtrinsic(signer, uniFactoryContract.abi, uniFactoryContract.bytecode, [deployer])
);

const DUMMY_WETH_ADDR = '0xB7d729C983b819611E68DAee71b4A2C950f86dc8';
export const getUniRouterDeployExtrinsic = async (signer: Signer, uniCoreAddr:string) => (
  getDeployExtrinsic(signer, uniRouterContract.abi, uniRouterContract.bytecode, [uniCoreAddr, DUMMY_WETH_ADDR])
);

export const getTokenDeployExtrinsic = async (signer: Signer, args: any[]) => (
  getDeployExtrinsic(signer, tokenContract.abi, tokenContract.bytecode, args)
);
```

**key point 2**: if in a batch, later tx depends on previous address, we will need to "predict the address" by using deployer address and nonce (suppose we use CREATE not CREATE2). In our case, uniswap router need to pass the uni core contract address in it's constructor, so we calculate the uni core address before deploying it.

After we constructed all extrinsics, we use `provider.api.tx.utility.batchAll` to batch them as a single extrinsic.

```ts
const txCount = await signer.getTransactionCount('latest');
const predictedUniCoreAddr = getContractAddress({ from: evmAddress, nonce: txCount });

const deployExtrinsics = await Promise.all([
  getUniFactoryDeployExtrinsic(signer, evmAddress),
  getUniRouterDeployExtrinsic(signer, predictedUniCoreAddr),
  getTokenDeployExtrinsic(signer, [1000000]),
  getTokenDeployExtrinsic(signer, [2000000]),
]);

const batchDeploy = provider.api.tx.utility.batchAll(deployExtrinsics);
```

we can then sign and send the batch extrinsic, and handle the result in the callback function.

**key point 3**: unlike sending usual single EVM transaction, where we handle result as "transaction receipt", for batch transaction's result, we mainly deal with substrate events. 

In this particular case, we need to find `evm.Created` result which contains the deployed address (as well as other info if needed).

```ts
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

    // do something after contract is deployed ...
  } else if (result.isError) {
    throw new Error('some perfect error handling');
  }
});
```

### Step 3: batch approve + add liquidity to uniswap
In this step we will batch 3 transactions, which usually requires 3 separate signature in traditional EVM.
- approve infinite token A spent limit for uniswap router
- approve infinite token B spent limit for uniswap router
- add liquidity to uniswap

This step is pretty similar to previous step, we first need to construct all the call extrinsics. The only thing that we should pay attention to is the `force` param.

**key point 4**: in a batch contract call, if later call depends on previous one, the dry run will fail. Dry run is usually a good thing that it can prevent user from sending failing tx, which can save them some gas. However, in our case we want to skip dry run, so we provide a `force` paramter to ignore if dry run failed.

In our particular case, "add liquidity" depends on "approve token", so we want to force sending the "add liquidity" extrinsic.

```ts
export const getTokenDeployExtrinsic = async (signer: Signer, args: any[]) => (
  getDeployExtrinsic(signer, tokenContract.abi, tokenContract.bytecode, args)
);

export const getTokenApproveExtrinsic = async (signer: Signer, contractAddr: string, args: any[]) => (
  getCallExtrinsic(signer, tokenContract.abi, contractAddr, 'approve', args)
);

export const getAddLiquidityExtrinsic = async (signer: Signer, contractAddr: string, args: any[], force = false) => (
  getCallExtrinsic(signer, uniRouterContract.abi, contractAddr, 'addLiquidity', args, 0, force)
);
```

the following step is the same as before, sending batch tx and handle result:
```ts
const callExtrinsics = await Promise.all([
  getTokenApproveExtrinsic(signer, token0Address, [uniRouterAddress, MaxUint256]),
  getTokenApproveExtrinsic(signer, token1Address, [uniRouterAddress, MaxUint256]),
  getAddLiquidityExtrinsic(signer, uniRouterAddress, [
    token0Address, token1Address, input0, input1, 0, 0, evmAddress, MaxUint256,
  ], true),
]);

const batchCall = provider.api.tx.utility.batchAll(callExtrinsics);

await batchCall.signAndSend(selectedAddress, (result: SubmittableResult) => {
  if (result.status.isInBlock) {
    // do something after contract call is mined ...
  } else if (result.isError) {
    throw new Error('some perfect error handling');
  }
});
```

### Step 4: batch recycle contracts
This is some bonus step that demonstrate another unique feature of EVM+: we can recycle unpublished contracts that was intended for testing. This can also refund developers a lot of gas, which was used as contract storage deposit.

There is nothing too special about this step, just some normal batch and send, that we are very familiar now:
```ts
const recycleExtrinsics = await Promise.all([
  provider.api.tx.evm.selfdestruct(uniCoreAddress),
  provider.api.tx.evm.selfdestruct(uniRouterAddress),
  provider.api.tx.evm.selfdestruct(token0Address),
  provider.api.tx.evm.selfdestruct(token1Address),
]);

const batchCall = provider.api.tx.utility.batchAll(recycleExtrinsics);

await batchCall.signAndSend(selectedAddress, (result: SubmittableResult) => {
  if (result.status.isInBlock) {
   // handle result
  } else if (result.isError) {
    throw new Error('some perfect error handling');
  }
```
