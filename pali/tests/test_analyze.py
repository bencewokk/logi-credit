from pali import analyze


def test_analyze():
    assert 'Analyzed' in analyze([0])
