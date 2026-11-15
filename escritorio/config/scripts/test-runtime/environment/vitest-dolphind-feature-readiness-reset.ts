// A startDolphind test that fails partway must not leave latches closed: later tests in the worker would wait 10 s.
import { afterEach } from 'vitest'
import { _resetDolphindFeatureReadinessForTests } from '../../../../src/main/runtime/rpc/dolphind-feature-readiness'

afterEach(() => {
  _resetDolphindFeatureReadinessForTests()
})
