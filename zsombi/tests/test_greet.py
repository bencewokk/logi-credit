from zsombi import greet


def test_greet():
    assert 'zsombi' in greet('you')
