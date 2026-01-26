from kristof.ledger import Ledger


def demo():
    ledger = Ledger()

    # initial deposits (not transfers)
    ledger.deposit(to_user="alice", amount=1_000_000, note="initial funding")
    ledger.deposit(to_user="bob", amount=200_000, note="initial funding")

    # a transfer between users (this is a "real" transaction)
    ledger.transfer(from_user="alice", to_user="bob", amount=150_000, note="payment")

    print("All transactions:")
    for tx in ledger.transactions():
        print(tx.to_dict())

    print("\nReal transactions (transfers only):")
    for tx in ledger.real_transactions():
        print(tx.to_dict())


if __name__ == '__main__':
    demo()
