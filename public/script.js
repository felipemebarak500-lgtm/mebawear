document.addEventListener('DOMContentLoaded', function() {
  const btn = document.getElementById('loginBtn');
  btn.addEventListener('click', function() {
    const user = document.getElementById('user').value.trim();
    const pass = document.getElementById('pass').value.trim();

    if (!user || !pass) {
      alert('Por favor ingresa usuario y contraseña.');
      return;
    }

    alert('Intentando iniciar sesión con: ' + user);
  });
});
