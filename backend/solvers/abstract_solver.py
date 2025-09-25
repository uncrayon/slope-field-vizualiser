from __future__ import annotations
from typing import Any, Callable, Dict, List, Optional, Tuple
import numpy as np
# Use a plain class for options to avoid dataclass/string-annotation issues when files
# are loaded directly (tests import modules by path). This keeps behavior simple and
# avoids dataclass introspection problems in non-package import scenarios.
class IntegratorOptions:
    def __init__(
        self,
        method: str = "RK45",
        rtol: float = 1e-6,
        atol: float = 1e-9,
        max_step: Optional[float] = None,
        backend: str = "scipy",
        extras: Optional[Dict[str, Any]] = None,
    ) -> None:
        self.method = method
        self.rtol = rtol
        self.atol = atol
        self.max_step = max_step
        self.backend = backend
        self.extras = extras or {}


class AbstractSolver:
    """
    Numerical integrator abstraction.

    Concrete implementations must implement `solve` which runs the integrator
    for one initial condition (or vectorized batch, see implementations).

    `func` is a callable f(t, y, params) -> ndarray (dy/dt).
    """

    def __init__(self, options: Optional[IntegratorOptions] = None) -> None:
        self.options = options or IntegratorOptions()

    def solve(
        self,
        func: Callable[[float, np.ndarray, Dict[str, float]], np.ndarray],
        t_span: Tuple[float, float],
        y0: np.ndarray,
        params: Optional[Dict[str, float]] = None,
        t_eval: Optional[np.ndarray] = None,
        events: Optional[List[Callable[[float, np.ndarray], float]]] = None,
    ) -> Tuple[np.ndarray, np.ndarray]:
        """
        Solve the initial value problem.

        Args:
            func: callable f(t, y, params) -> dy/dt (numpy array)
            t_span: (t0, tf)
            y0: initial state vector (ndim,)
            params: parameter dictionary passed to func
            t_eval: optional array of times at which to store the solution
            events: optional list of event functions g(t, y) that return a float
                    (zero crossing indicates an event). Concrete solvers may support
                    only subsets of this API.

        Returns:
            times: ndarray of shape (nt,)
            trajectories: ndarray of shape (nt, ndim)
        """
        raise NotImplementedError("Abstract method - implement in subclass")

    def solve_batch(
        self,
        func: Callable[[float, np.ndarray, Dict[str, float]], np.ndarray],
        t_span: Tuple[float, float],
        y0_batch: np.ndarray,
        params: Optional[Dict[str, float]] = None,
        t_eval: Optional[np.ndarray] = None,
        events: Optional[List[Callable[[float, np.ndarray], float]]] = None,
    ) -> Tuple[np.ndarray, np.ndarray]:
        """
        Optional: vectorized batch solve for many initial conditions in y0_batch
        (shape: n_ic, ndim). Default implementation runs `solve` serially and
        stacks results. Implementations optimized for batch execution should
        override this method.
        """
        results = []
        times = None
        for idx in range(y0_batch.shape[0]):
            t, traj = self.solve(func, t_span, y0_batch[idx], params=params, t_eval=t_eval, events=events)
            if times is None:
                times = t
            results.append(traj)
        return times, np.stack(results, axis=1)  # shape (nt, n_ic, ndim)