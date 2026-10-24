package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

// dompile is a native Linux command-line launcher. The application itself is
// kept as readable JavaScript and runs on the packaged Node.js dependency.
func main() {
	node, err := exec.LookPath("node")
	if err != nil {
		node, err = exec.LookPath("nodejs")
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, "Dompile needs Node.js 18 or newer. Install the nodejs package and try again.")
		os.Exit(127)
	}

	script, err := findScript()
	if err != nil {
		fmt.Fprintln(os.Stderr, "Dompile:", err)
		os.Exit(2)
	}

	cmd := exec.Command(node, append([]string{script}, os.Args[1:]...)...)
	cmd.Stdin, cmd.Stdout, cmd.Stderr = os.Stdin, os.Stdout, os.Stderr
	cmd.Env = os.Environ()
	if err := cmd.Run(); err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			os.Exit(exitErr.ExitCode())
		}
		fmt.Fprintln(os.Stderr, "Dompile:", err)
		os.Exit(1)
	}
}

func findScript() (string, error) {
	if override := os.Getenv("DOMPILE_JS_PATH"); override != "" {
		if isFile(override) {
			return override, nil
		}
		return "", fmt.Errorf("DOMPILE_JS_PATH does not name a file: %s", override)
	}

	executable, err := os.Executable()
	if err == nil {
		dir := filepath.Dir(executable)
		candidates := []string{
			"/usr/lib/dompile/dompile.js",
			filepath.Join(dir, "dompile.js"),
			filepath.Join(dir, "..", "lib", "dompile", "dompile.js"),
			filepath.Join(dir, "..", "dompile.js"),
		}
		for _, candidate := range candidates {
			if isFile(candidate) {
				resolved, resolveErr := filepath.Abs(candidate)
				if resolveErr == nil {
					return resolved, nil
				}
				return candidate, nil
			}
		}
	}

	if isFile("dompile.js") {
		resolved, err := filepath.Abs("dompile.js")
		if err == nil {
			return resolved, nil
		}
	}
	return "", fmt.Errorf("cannot find dompile.js beside the executable or in /usr/lib/dompile")
}

func isFile(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.Mode().IsRegular()
}
