import importlib.util
import os
from pathlib import Path
import numpy as np
import numpy.testing as npt

ROOT = Path(__file__).resolve().parents[2]  # project root


def load_module_from_path(name: str, rel_path: str):
    path = ROOT / rel_path
    spec = importlib.util.spec_from_file_location(name, str(path))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)  # type: ignore
    return module


def test_parser_scalar_and_system():
    parser_mod = load_module_from_path("parser", "backend/parser/parser.py")
    MathematicaParser = parser_mod.MathematicaParser

    p = MathematicaParser()

    # scalar ODE
    f, vars_ = p.parse("x'[t] == -x[t]")
    assert vars_ == ["x"]
    y = np.array([2.0])
    dy = f(0.0, y, {})
    npt.assert_allclose(dy, np.array([-2.0]), atol=1e-12)

    # system
    f2, vars2 = p.parse("{x'[t], y'[t]} == {x[t] - y[t], x[t]*y[t]}")
    assert vars2 == ["x", "y"]
    y0 = np.array([1.0, 3.0])
    dy2 = f2(0.0, y0, {})
    npt.assert_allclose(dy2, np.array([1.0 - 3.0, 1.0 * 3.0]), atol=1e-12)


def test_scipy_solver_exp_decay():
    # load modules by path to avoid package import issues in test env
    parser_mod = load_module_from_path("parser", "backend/parser/parser.py")
    scipy_mod = load_module_from_path("scipy_solver", "backend/solvers/scipy_solver.py")

    MathematicaParser = parser_mod.MathematicaParser
    ScipySolver = scipy_mod.ScipySolver
    IntegratorOptions = load_module_from_path("abstract", "backend/solvers/abstract_solver.py").IntegratorOptions

    p = MathematicaParser()
    f, vars_ = p.parse("x'[t] == -x[t]")
    solver = ScipySolver(IntegratorOptions(method="RK45"))
    t_span = (0.0, 2.0)
    t_eval = np.linspace(0.0, 2.0, 101)
    times, traj = solver.solve(f, t_span, np.array([1.0]), params={}, t_eval=t_eval)
    # analytic solution exp(-t)
    expected = np.exp(-times)
    # traj shape (nt, ndim)
    npt.assert_allclose(traj.flatten(), expected, rtol=1e-5, atol=1e-7)


def test_numba_runner_rk4_accuracy():
    # Uses pure-Python RK4 integrator provided by NumbaRunner (numba optional)
    parser_mod = load_module_from_path("parser", "backend/parser/parser.py")
    nr_mod = load_module_from_path("numba_runner", "backend/solvers/numba_runner.py")

    MathematicaParser = parser_mod.MathematicaParser
    NumbaRunner = nr_mod.NumbaRunner

    p = MathematicaParser()
    f, vars_ = p.parse("x'[t] == -x[t]")
    runner = NumbaRunner()
    t_span = (0.0, 2.0)
    t_eval = np.linspace(0.0, 2.0, 201)
    times, traj = runner.solve(f, t_span, np.array([1.0]), params={}, t_eval=t_eval)
    expected = np.exp(-times)
    # RK4 with fine grid should be reasonably accurate; allow looser tolerance than SciPy
    npt.assert_allclose(traj.flatten(), expected, rtol=5e-4, atol=1e-4)