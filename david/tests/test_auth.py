from david import auth_message


def test_auth_message():
    assert 'Auth module' in auth_message('x')
