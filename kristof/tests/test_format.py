from kristof import format_txn


def test_format_txn():
    assert '1 - 100' == format_txn({'id':1,'amount':100})