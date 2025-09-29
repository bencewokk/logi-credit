from . import format_txn


def run():
    print(format_txn({'id':1,'amount':100}))


if __name__ == '__main__':
    run()
