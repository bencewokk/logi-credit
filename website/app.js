document.addEventListener('DOMContentLoaded',()=>{
  console.log('Logi Credit starter site loaded')
  // Simple helper: highlight nav link for current page
  const links = document.querySelectorAll('header nav a')
  links.forEach(a=>{
    if(a.getAttribute('href')===window.location.pathname.split('/').pop()){
      a.style.textDecoration='underline'
    }
  })
})
