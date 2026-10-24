Name:           dompile
Version:        1.0.0
Release:        1
Summary:        Package HTML, CSS, and JavaScript as portable DTML documents
License:        MIT
BuildArch:      x86_64
Requires:       nodejs >= 18
Source0:        dompile
Source1:        dompile.js
Source2:        package.json
Source3:        README.md
Source4:        LICENSE

%description
Dompile compiles web source into a single DTML document and can emit website
HTML or a minimal Electron application project.

%install
install -D -m 0755 %{SOURCE0} %{buildroot}%{_bindir}/dompile
install -D -m 0644 %{SOURCE1} %{buildroot}%{_prefix}/lib/dompile/dompile.js
install -D -m 0644 %{SOURCE2} %{buildroot}%{_prefix}/lib/dompile/package.json
install -D -m 0644 %{SOURCE3} %{buildroot}%{_datadir}/doc/dompile/README.md
install -D -m 0644 %{SOURCE4} %{buildroot}%{_datadir}/doc/dompile/LICENSE

%files
%{_bindir}/dompile
%{_prefix}/lib/dompile/dompile.js
%{_prefix}/lib/dompile/package.json
%{_datadir}/doc/dompile/README.md
%{_datadir}/doc/dompile/LICENSE

%changelog
* Fri Oct 23 2026 Dompile contributors - 1.0.0-1
- Initial Linux package release
