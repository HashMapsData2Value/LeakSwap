from binascii import unhexlify
from monero.backends.jsonrpc import JSONRPCWallet
from monero.base58 import encode
import secrets

import utils as u

def generate_monero_keys(seed_hex=None, env="main"):
    l = 2 ** 252 + 27742317777372353535851937790883648493 
    # l prime order of the elliptic curve basepoint

    if seed_hex:
        seed_dec = int(seed_hex, 16)
        spend_sk = u.little_to_big(u.itb(seed_dec))
    else:
        spend_sk = u.itb(secrets.randbits(256) % l)

    view_sk = u.itb(u.bti(u.hash256(spend_sk)) % l)
    # generate view_sk from spend_sk so we only need to store one key.

    spend_pk = u.get_public_from_secret(spend_sk)
    view_pk = u.get_public_from_secret(view_sk)


    # 18 main chain, 53 test chain, 24 stage chain
    if env == "main":
        prefix = "12" # hex(18)
    elif env == "stage":
        prefix = "18" # hex(24)
    elif env == "test":
        prefix = "35" # hex(53)

    data = prefix + spend_pk.hex() + view_pk.hex()
    checksum = u.hash256(bytearray(unhexlify(data)))[:4]
    address = data + checksum.hex()

    return [[spend_sk, spend_pk], [view_sk, view_pk]], encode(address)

def generate_from_keys(wallet_filename, address, spendkey, viewkey, pw):
    # Example from https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#generate_from_keys
    rpc_server = JSONRPCWallet(port=28088)
    result = rpc_server.raw_request(method="generate_from_keys", params={
            "restore_height": 0,
            "filename":wallet_filename,
            "address":address,
            "spendkey":spendkey.hex(),
            "viewkey":viewkey.hex(),
            "password":pw,
        })
    return result

def get_combined_private_key(partial_private_spend_a, partial_private_spend_b):
    return u.scalar_add(partial_private_spend_a, partial_private_spend_b)

"""
Tests just to check that things work
"""

def test_monero_address():
    private_spend_key = "39c4b3cc4fa2ccad647990f67e8d84b611d5a15d53225213cc42783f227c4909"
    private_view_key = "a86be8c70784ec97a8c8d45212b1ea356759ef1ff1a0983190351c62b14b3500"
    public_spend_key = "ca5f63d230d44e6b3420edd2e797e2a18d5fb98e59dc594c02c4fac6441519f8"
    public_view_key = "f070076aa7ccf42db141bbf6dfe6131409e34a99766dc5f3db407028efeca65c"
    correct_address = "49HupRMMmXsJw1YshMsNJ5U2G2fSCdpu6DiQD7KE9NwSie2HZjD7hBZ8eGsQw2rvQr4MQBngHjNRrhniMht6xzkVBVFTY3M"

    keys, address = generate_monero_keys(seed_hex=private_spend_key)

    assert keys[0][0].hex() == private_spend_key
    assert keys[0][1].hex() == public_spend_key
    assert keys[1][0].hex() == private_view_key
    assert keys[1][1].hex() == public_view_key
    assert address == correct_address


def test_keys_addition():
    """
    Test that the generated keys can actually be added with each other.
    """

    alice, _ = generate_monero_keys()
    bob, _ = generate_monero_keys()

    assert u.points_add(alice[0][1], bob[0][1]) == u.get_public_from_secret(u.scalar_add(alice[0][0], bob[0][0]))
    assert u.points_add(alice[1][1], bob[1][1]) == u.get_public_from_secret(u.scalar_add(alice[1][0], bob[1][0]))


def test_monero_rpc_generate_from_keys():
    xavier = generate_monero_keys(env="test")
    result = generate_from_keys("xavier_wallet", xavier[1], xavier[0][0][0], xavier[0][1][0], "")
    assert "Wallet has been generated successfully." in result["info"]

if __name__ == '__main__':
    test_keys_addition()
    test_monero_address()
    #test_monero_rpc_generate_from_keys()