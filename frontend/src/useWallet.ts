import { useEffect, useState } from 'react'
import { createWalletClient, custom, type Address, type EIP1193Provider } from 'viem'
import { chain, rpcUrl } from './ledger'

type Provider = EIP1193Provider & { isMetaMask?: boolean; providers?: Provider[] }
function metaMask() {
  const injected = (window as Window & { ethereum?: Provider }).ethereum
  return injected?.providers?.find((provider) => provider.isMetaMask) ?? (injected?.isMetaMask ? injected : undefined)
}

export function useWallet() {
  const [account, setAccount] = useState<Address>()
  const [chainId, setChainId] = useState<number>()

  useEffect(() => {
    const provider = metaMask()
    if (!provider) return
    let active = true
    const accountsChanged = (accounts: string[]) => { if (active) setAccount(accounts[0] as Address | undefined) }
    const chainChanged = (id: string) => { if (active) setChainId(Number(id)) }
    const disconnected = () => { if (active) { setAccount(undefined); setChainId(undefined) } }
    provider.on('accountsChanged', accountsChanged)
    provider.on('chainChanged', chainChanged)
    provider.on('disconnect', disconnected)
    void provider.request({ method: 'eth_accounts' }).then(accountsChanged).catch(disconnected)
    void provider.request({ method: 'eth_chainId' }).then(chainChanged).catch(disconnected)
    return () => {
      active = false
      provider.removeListener('accountsChanged', accountsChanged)
      provider.removeListener('chainChanged', chainChanged)
      provider.removeListener('disconnect', disconnected)
    }
  }, [])

  function client() {
    const provider = metaMask()
    if (!provider) throw new Error('Install the MetaMask browser extension, then reload this page.')
    return createWalletClient({ chain, transport: custom(provider) })
  }

  async function connect() {
    const wallet = client()
    const accounts = await wallet.requestAddresses()
    setAccount(accounts[0])
    setChainId(await wallet.getChainId())
  }

  async function switchNetwork() {
    const wallet = client()
    try { await wallet.switchChain({ id: chain.id }) }
    catch (error) {
      if (!JSON.stringify(error).includes('4902')) throw error
      await wallet.addChain({ chain: { ...chain, name: 'Hardhat Local', rpcUrls: { default: { http: [rpcUrl] } } } })
      await wallet.switchChain({ id: chain.id })
    }
    setChainId(await wallet.getChainId())
  }

  async function signingWallet() {
    const wallet = client()
    if (await wallet.getChainId() !== chain.id) throw new Error('Wrong network. Switch MetaMask to Hardhat Local (31337).')
    const [currentAccount] = await wallet.getAddresses()
    if (!currentAccount) throw new Error('Connect MetaMask before sending a transaction.')
    if (currentAccount.toLowerCase() !== account?.toLowerCase()) throw new Error('The wallet account changed. Retry with the current account.')
    return { wallet, account: currentAccount }
  }
  return { account, chainId, connect, switchNetwork, signingWallet }
}
